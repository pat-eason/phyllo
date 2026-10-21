//! Audio encoders for export. Input is a raw interleaved little-endian `f32` file (the session's spool file);
//! output is a WAV, FLAC or MP3 file. Pure functions over explicit paths, so they are unit-tested with tempdirs.
//!
//! The spool is read in blocks and never held whole in memory (FLAC keeps the compressed stream, MP3 the
//! compressed bytes). Gain (normalize) is applied while reading, so no second spool is needed.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

use flacenc::component::BitRepr;
use flacenc::error::{SourceError, Verify};
use flacenc::source::{Fill, Source};
use mp3lame_encoder::{Bitrate, Builder, FlushNoGap, InterleavedPcm, MonoPcm};

use crate::error::{Error, IoContext, Result};

/// Frames per read from the spool.
const BLOCK_FRAMES: usize = 4096;

/// MP3 sample rates LAME can encode at 320 kbps (MPEG-1 Layer III).
pub const MP3_RATES: [u32; 3] = [32_000, 44_100, 48_000];

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Wav,
    Flac,
    Mp3,
}

impl Format {
    pub fn extension(self) -> &'static str {
        match self {
            Format::Wav => "wav",
            Format::Flac => "flac",
            Format::Mp3 => "mp3",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Spec {
    pub format: Format,
    /// 16, 24 or 32 (32 = float, WAV only). Ignored for MP3.
    pub bit_depth: u8,
    pub sample_rate: u32,
    pub channels: u8,
}

impl Spec {
    /// Reject combinations the encoders cannot produce.
    pub fn validate(&self) -> Result<()> {
        if !(1..=2).contains(&self.channels) {
            return Err(Error::InvalidArgument(format!(
                "channels must be 1 or 2, got {}",
                self.channels
            )));
        }
        if !(8_000..=384_000).contains(&self.sample_rate) {
            return Err(Error::InvalidArgument(format!(
                "sample rate out of range: {}",
                self.sample_rate
            )));
        }
        if !matches!(self.bit_depth, 16 | 24 | 32) {
            return Err(Error::InvalidArgument(format!(
                "bit depth must be 16, 24 or 32, got {}",
                self.bit_depth
            )));
        }
        match self.format {
            Format::Wav => {}
            Format::Flac if self.bit_depth == 32 => {
                return Err(Error::InvalidArgument(
                    "FLAC supports 16 or 24 bit, not 32-bit float".into(),
                ));
            }
            Format::Flac => {}
            Format::Mp3 if !MP3_RATES.contains(&self.sample_rate) => {
                return Err(Error::InvalidArgument(format!(
                    "MP3 320 kbps needs a sample rate of 32000, 44100 or 48000 Hz, got {}",
                    self.sample_rate
                )));
            }
            Format::Mp3 => {}
        }
        Ok(())
    }
}

/// Non-finite samples would poison the encoders; they export as silence.
#[inline]
pub fn clean(x: f32) -> f32 {
    if x.is_finite() { x } else { 0.0 }
}

/// Reads the spool in blocks of interleaved `f32`.
struct PcmReader {
    reader: BufReader<File>,
    channels: usize,
    bytes: Vec<u8>,
}

impl PcmReader {
    fn open(path: &Path, channels: usize) -> Result<Self> {
        let file = File::open(path).at(path)?;
        Ok(Self {
            reader: BufReader::with_capacity(1 << 20, file),
            channels,
            bytes: vec![0; BLOCK_FRAMES * channels * 4],
        })
    }

    /// Fill `out` with up to `max_frames` frames (scaled by `gain`, sanitised). Returns the frame count; 0 = end.
    fn read_block(
        &mut self,
        max_frames: usize,
        gain: f32,
        out: &mut Vec<f32>,
    ) -> std::io::Result<usize> {
        let want = max_frames.min(BLOCK_FRAMES) * self.channels * 4;
        let buf = &mut self.bytes[..want];
        let mut got = 0;
        while got < want {
            let n = self.reader.read(&mut buf[got..])?;
            if n == 0 {
                break;
            }
            got += n;
        }
        let frame_bytes = self.channels * 4;
        let usable = got - got % frame_bytes;
        out.clear();
        out.extend(
            buf[..usable]
                .chunks_exact(4)
                .map(|b| clean(f32::from_le_bytes([b[0], b[1], b[2], b[3]])) * gain),
        );
        Ok(usable / frame_bytes)
    }
}

/// Deterministic xorshift64* for dither, so identical input gives identical output.
struct Dither(u64);

impl Dither {
    fn new() -> Self {
        Self(0x9E37_79B9_7F4A_7C15)
    }

    /// Uniform in [0, 1).
    fn uniform(&mut self) -> f32 {
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        let v = self.0.wrapping_mul(0x2545_F491_4F6C_DD1D);
        (v >> 40) as f32 / (1u64 << 24) as f32
    }

    /// Triangular PDF in (-1, 1) LSB.
    fn tpdf(&mut self) -> f32 {
        self.uniform() - self.uniform()
    }
}

/// Float -> signed integer of `bits` (16/24), full scale 1.0 = `2^(bits-1) - 1`, clamped.
/// 16-bit gets TPDF dither; 24-bit is rounded.
struct Quantizer {
    bits: u8,
    dither: Dither,
}

impl Quantizer {
    fn new(bits: u8) -> Self {
        Self {
            bits,
            dither: Dither::new(),
        }
    }

    #[inline]
    fn quantize(&mut self, x: f32) -> i32 {
        let max = ((1i64 << (self.bits - 1)) - 1) as f32;
        let min = -(1i64 << (self.bits - 1)) as f32;
        let d = if self.bits == 16 {
            self.dither.tpdf()
        } else {
            0.0
        };
        (x * max + d).round().clamp(min, max) as i32
    }
}

/// Encode the spool to `dest` (not atomic; the caller supplies a temp path and renames).
/// `gain` is a linear multiplier applied to every sample.
pub fn encode_file(pcm: &Path, spec: Spec, gain: f32, dest: &Path) -> Result<()> {
    spec.validate()?;
    match spec.format {
        Format::Wav => encode_wav(pcm, spec, gain, dest),
        Format::Flac => encode_flac(pcm, spec, gain, dest),
        Format::Mp3 => encode_mp3(pcm, spec, gain, dest),
    }
}

fn encode_wav(pcm: &Path, spec: Spec, gain: f32, dest: &Path) -> Result<()> {
    let float = spec.bit_depth == 32;
    let wav_spec = hound::WavSpec {
        channels: u16::from(spec.channels),
        sample_rate: spec.sample_rate,
        bits_per_sample: u16::from(spec.bit_depth),
        sample_format: if float {
            hound::SampleFormat::Float
        } else {
            hound::SampleFormat::Int
        },
    };
    let file = File::create(dest).at(dest)?;
    let mut writer = hound::WavWriter::new(BufWriter::new(file), wav_spec).map_err(encode_err)?;
    let mut reader = PcmReader::open(pcm, usize::from(spec.channels))?;
    let mut quant = Quantizer::new(spec.bit_depth.min(24));
    let mut block = Vec::new();
    loop {
        let frames = reader.read_block(BLOCK_FRAMES, gain, &mut block).at(pcm)?;
        if frames == 0 {
            break;
        }
        for &s in &block {
            if float {
                writer.write_sample(s).map_err(encode_err)?;
            } else {
                writer
                    .write_sample(quant.quantize(s.clamp(-1.0, 1.0)))
                    .map_err(encode_err)?;
            }
        }
    }
    writer.finalize().map_err(encode_err)
}

/// Streaming source for `flacenc` over the spool.
struct FlacSource {
    reader: PcmReader,
    quant: Quantizer,
    spec: Spec,
    gain: f32,
    floats: Vec<f32>,
    ints: Vec<i32>,
    total_frames: usize,
}

impl Source for FlacSource {
    fn channels(&self) -> usize {
        usize::from(self.spec.channels)
    }

    fn bits_per_sample(&self) -> usize {
        usize::from(self.spec.bit_depth)
    }

    fn sample_rate(&self) -> usize {
        self.spec.sample_rate as usize
    }

    fn read_samples<F: Fill>(
        &mut self,
        block_size: usize,
        dest: &mut F,
    ) -> std::result::Result<usize, SourceError> {
        let mut frames = 0;
        self.ints.clear();
        // `block_size` can exceed our read block; keep reading until the block is full or the spool ends.
        while frames < block_size {
            let n = self
                .reader
                .read_block(block_size - frames, self.gain, &mut self.floats)
                .map_err(SourceError::from_io_error)?;
            if n == 0 {
                break;
            }
            for &s in &self.floats {
                self.ints.push(self.quant.quantize(s.clamp(-1.0, 1.0)));
            }
            frames += n;
        }
        if frames == 0 {
            return Ok(0);
        }
        dest.fill_interleaved(&self.ints)?;
        Ok(frames)
    }

    fn len_hint(&self) -> Option<usize> {
        Some(self.total_frames)
    }
}

fn encode_flac(pcm: &Path, spec: Spec, gain: f32, dest: &Path) -> Result<()> {
    let channels = usize::from(spec.channels);
    let total_frames = std::fs::metadata(pcm).at(pcm)?.len() as usize / (4 * channels);
    let source = FlacSource {
        reader: PcmReader::open(pcm, channels)?,
        quant: Quantizer::new(spec.bit_depth),
        spec,
        gain,
        floats: Vec::new(),
        ints: Vec::new(),
        total_frames,
    };
    let config = flacenc::config::Encoder::default()
        .into_verified()
        .map_err(|(_, e)| Error::Encode(format!("FLAC config: {e}")))?;
    let stream = flacenc::encode_with_fixed_block_size(&config, source, config.block_size)
        .map_err(|e| Error::Encode(format!("FLAC: {e}")))?;
    let mut sink = flacenc::bitsink::ByteSink::new();
    stream
        .write(&mut sink)
        .map_err(|e| Error::Encode(format!("FLAC: {e}")))?;
    std::fs::write(dest, sink.as_slice()).at(dest)
}

fn encode_mp3(pcm: &Path, spec: Spec, gain: f32, dest: &Path) -> Result<()> {
    let unsupported =
        |what: &str| Error::UnsupportedFormat(format!("MP3 encoder unavailable: {what}"));
    let mut builder = Builder::new().ok_or_else(|| unsupported("could not initialise LAME"))?;
    builder
        .set_num_channels(spec.channels)
        .map_err(|e| unsupported(&format!("{e:?}")))?;
    builder
        .set_sample_rate(spec.sample_rate)
        .map_err(|e| unsupported(&format!("{e:?}")))?;
    builder
        .set_brate(Bitrate::Kbps320)
        .map_err(|e| unsupported(&format!("{e:?}")))?;
    builder
        .set_quality(mp3lame_encoder::Quality::Best)
        .map_err(|e| unsupported(&format!("{e:?}")))?;
    // No Xing/Info frame: LAME would reserve a placeholder that has to be patched in afterwards, and plain CBR
    // streams play and seek fine without it.
    builder
        .set_to_write_vbr_tag(false)
        .map_err(|e| unsupported(&format!("{e:?}")))?;
    let mut encoder = builder
        .build()
        .map_err(|e| unsupported(&format!("{e:?}")))?;

    let file = File::create(dest).at(dest)?;
    let mut out = BufWriter::new(file);
    let mut reader = PcmReader::open(pcm, usize::from(spec.channels))?;
    let mut block = Vec::new();
    let mut shorts: Vec<i16> = Vec::new();
    let mut mp3 = Vec::new();
    loop {
        let frames = reader.read_block(BLOCK_FRAMES, gain, &mut block).at(pcm)?;
        if frames == 0 {
            break;
        }
        // Plain rounding (no dither): the signal goes through a lossy codec anyway.
        shorts.clear();
        shorts.extend(
            block
                .iter()
                .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0).round() as i16),
        );
        mp3.clear();
        mp3.reserve(mp3lame_encoder::max_required_buffer_size(frames));
        let written = if spec.channels == 1 {
            encoder.encode_to_vec(MonoPcm(&shorts), &mut mp3)
        } else {
            encoder.encode_to_vec(InterleavedPcm(&shorts), &mut mp3)
        }
        .map_err(|e| Error::Encode(format!("MP3: {e:?}")))?;
        out.write_all(&mp3[..written]).at(dest)?;
    }
    mp3.clear();
    mp3.reserve(7200);
    let written = encoder
        .flush_to_vec::<FlushNoGap>(&mut mp3)
        .map_err(|e| Error::Encode(format!("MP3 flush: {e:?}")))?;
    out.write_all(&mp3[..written]).at(dest)?;
    out.flush().at(dest)
}

fn encode_err(e: hound::Error) -> Error {
    match e {
        hound::Error::IoError(source) => Error::Io {
            path: "export".into(),
            source,
        },
        other => Error::Encode(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub fn write_spool(path: &Path, frames: &[f32]) {
        let bytes: Vec<u8> = frames.iter().flat_map(|f| f.to_le_bytes()).collect();
        std::fs::write(path, bytes).unwrap();
    }

    fn sine(frames: usize, channels: usize, rate: u32, amp: f32) -> Vec<f32> {
        (0..frames)
            .flat_map(|i| {
                let v = amp * (2.0 * std::f32::consts::PI * 440.0 * i as f32 / rate as f32).sin();
                std::iter::repeat_n(v, channels)
            })
            .collect()
    }

    fn spec(format: Format, bit_depth: u8, channels: u8, rate: u32) -> Spec {
        Spec {
            format,
            bit_depth,
            sample_rate: rate,
            channels,
        }
    }

    #[test]
    fn wav_headers_and_samples_for_each_bit_depth() {
        let tmp = tempfile::tempdir().unwrap();
        let pcm = tmp.path().join("in.f32");
        let data = sine(4800, 2, 48_000, 0.5);
        write_spool(&pcm, &data);

        for (bits, fmt) in [
            (16u8, hound::SampleFormat::Int),
            (24, hound::SampleFormat::Int),
            (32, hound::SampleFormat::Float),
        ] {
            let out = tmp.path().join(format!("out{bits}.wav"));
            encode_file(&pcm, spec(Format::Wav, bits, 2, 48_000), 1.0, &out).unwrap();
            let mut r = hound::WavReader::open(&out).unwrap();
            let s = r.spec();
            assert_eq!(s.channels, 2);
            assert_eq!(s.sample_rate, 48_000);
            assert_eq!(s.bits_per_sample, u16::from(bits));
            assert_eq!(s.sample_format, fmt);
            assert_eq!(r.duration(), 4800);
            if bits == 32 {
                let got: Vec<f32> = r.samples::<f32>().map(|x| x.unwrap()).collect();
                assert_eq!(got, data);
            } else {
                let max = ((1i64 << (bits - 1)) - 1) as f32;
                let tolerance = if bits == 16 { 2.0 } else { 1.0 };
                for (g, want) in r.samples::<i32>().map(|x| x.unwrap()).zip(&data) {
                    assert!(
                        (g as f32 - want * max).abs() <= tolerance,
                        "{bits}-bit: {g} vs {}",
                        want * max
                    );
                }
            }
        }
    }

    #[test]
    fn wav_clamps_overs_for_integer_formats_only() {
        let tmp = tempfile::tempdir().unwrap();
        let pcm = tmp.path().join("in.f32");
        write_spool(&pcm, &[2.0, -2.0, f32::NAN, f32::INFINITY]);
        let out = tmp.path().join("o.wav");
        encode_file(&pcm, spec(Format::Wav, 24, 1, 44_100), 1.0, &out).unwrap();
        let got: Vec<i32> = hound::WavReader::open(&out)
            .unwrap()
            .samples::<i32>()
            .map(|x| x.unwrap())
            .collect();
        assert_eq!(got, vec![8_388_607, -8_388_607, 0, 0]);
    }

    #[test]
    fn sixteen_bit_is_dithered_but_tiny() {
        let tmp = tempfile::tempdir().unwrap();
        let pcm = tmp.path().join("in.f32");
        write_spool(&pcm, &vec![0.0; 20_000]);
        let out = tmp.path().join("o.wav");
        encode_file(&pcm, spec(Format::Wav, 16, 1, 44_100), 1.0, &out).unwrap();
        let got: Vec<i32> = hound::WavReader::open(&out)
            .unwrap()
            .samples::<i32>()
            .map(|x| x.unwrap())
            .collect();
        assert!(
            got.iter().all(|v| v.abs() <= 1),
            "TPDF stays within +-1 LSB"
        );
        assert!(got.iter().any(|v| *v != 0), "dither is present");
        let mean: f64 = got.iter().map(|&v| f64::from(v)).sum::<f64>() / got.len() as f64;
        assert!(mean.abs() < 0.05, "dither is unbiased, mean {mean}");
    }

    #[test]
    fn gain_is_applied() {
        let tmp = tempfile::tempdir().unwrap();
        let pcm = tmp.path().join("in.f32");
        write_spool(&pcm, &[0.25, -0.25]);
        let out = tmp.path().join("o.wav");
        encode_file(&pcm, spec(Format::Wav, 32, 1, 44_100), 2.0, &out).unwrap();
        let got: Vec<f32> = hound::WavReader::open(&out)
            .unwrap()
            .samples::<f32>()
            .map(|x| x.unwrap())
            .collect();
        assert_eq!(got, vec![0.5, -0.5]);
    }

    #[test]
    fn flac_decodes_to_the_same_samples() {
        let tmp = tempfile::tempdir().unwrap();
        let pcm = tmp.path().join("in.f32");
        // Longer than one 4096 block and not a multiple of it.
        let data = sine(10_000, 2, 44_100, 0.6);
        write_spool(&pcm, &data);
        for bits in [16u8, 24] {
            let out = tmp.path().join(format!("o{bits}.flac"));
            encode_file(&pcm, spec(Format::Flac, bits, 2, 44_100), 1.0, &out).unwrap();
            let mut r = claxon::FlacReader::open(&out).unwrap();
            let info = r.streaminfo();
            assert_eq!(info.channels, 2);
            assert_eq!(info.sample_rate, 44_100);
            assert_eq!(info.bits_per_sample, u32::from(bits));
            assert_eq!(info.samples, Some(10_000));
            let got: Vec<i32> = r.samples().map(|s| s.unwrap()).collect();
            assert_eq!(got.len(), data.len());
            let max = ((1i64 << (bits - 1)) - 1) as f32;
            let tolerance = if bits == 16 { 2.0 } else { 1.0 };
            for (g, want) in got.iter().zip(&data) {
                assert!((*g as f32 - want * max).abs() <= tolerance);
            }
        }
    }

    #[test]
    fn flac_rejects_float() {
        let tmp = tempfile::tempdir().unwrap();
        let pcm = tmp.path().join("in.f32");
        write_spool(&pcm, &[0.0; 8]);
        let err = encode_file(
            &pcm,
            spec(Format::Flac, 32, 1, 44_100),
            1.0,
            &tmp.path().join("o.flac"),
        )
        .unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
    }

    /// Walk the MPEG frames: (version, layer, bitrate kbps, sample rate, channels mode) for each.
    fn mp3_frames(bytes: &[u8]) -> Vec<(u8, u8, u32, u32, u8)> {
        const BITRATES_V1_L3: [u32; 16] = [
            0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
        ];
        const RATES_V1: [u32; 4] = [44_100, 48_000, 32_000, 0];
        let mut i = 0;
        let mut frames = Vec::new();
        while i + 4 <= bytes.len() {
            let h = u32::from_be_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]);
            if h >> 21 != 0x7FF {
                break;
            }
            let version = ((h >> 19) & 3) as u8; // 3 = MPEG-1
            let layer = ((h >> 17) & 3) as u8; // 1 = Layer III
            let bitrate = BITRATES_V1_L3[((h >> 12) & 0xF) as usize];
            let rate = RATES_V1[((h >> 10) & 3) as usize];
            let padding = (h >> 9) & 1;
            let mode = ((h >> 6) & 3) as u8; // 3 = mono
            assert!(bitrate > 0 && rate > 0, "bad header at {i}");
            frames.push((version, layer, bitrate, rate, mode));
            i += (144 * bitrate * 1000 / rate + padding) as usize;
        }
        assert_eq!(i, bytes.len(), "frames tile the file exactly");
        frames
    }

    #[test]
    fn mp3_is_320_cbr_frames() {
        let tmp = tempfile::tempdir().unwrap();
        let pcm = tmp.path().join("in.f32");
        write_spool(&pcm, &sine(48_000, 2, 48_000, 0.5));
        let out = tmp.path().join("o.mp3");
        encode_file(&pcm, spec(Format::Mp3, 24, 2, 48_000), 1.0, &out).unwrap();
        let frames = mp3_frames(&std::fs::read(&out).unwrap());
        // 1 s at 48 kHz is 1152-sample frames: ~42 + encoder delay/flush.
        assert!((40..=46).contains(&frames.len()), "{} frames", frames.len());
        for (version, layer, bitrate, rate, mode) in &frames {
            assert_eq!((*version, *layer, *bitrate, *rate), (3, 1, 320, 48_000));
            assert_ne!(*mode, 3, "stereo");
        }
    }

    #[test]
    fn mp3_mono_and_rate_rules() {
        let tmp = tempfile::tempdir().unwrap();
        let pcm = tmp.path().join("in.f32");
        write_spool(&pcm, &sine(44_100, 1, 44_100, 0.5));
        let out = tmp.path().join("o.mp3");
        encode_file(&pcm, spec(Format::Mp3, 16, 1, 44_100), 1.0, &out).unwrap();
        let frames = mp3_frames(&std::fs::read(&out).unwrap());
        assert!(
            frames
                .iter()
                .all(|f| f.4 == 3 && f.2 == 320 && f.3 == 44_100)
        );

        let err = encode_file(
            &pcm,
            spec(Format::Mp3, 16, 1, 22_050),
            1.0,
            &tmp.path().join("x.mp3"),
        )
        .unwrap_err();
        assert_eq!(err.code(), "invalid_argument");
    }

    #[test]
    fn validate_rejects_bad_specs() {
        let ok = spec(Format::Wav, 24, 2, 48_000);
        assert!(ok.validate().is_ok());
        for bad in [
            Spec { channels: 3, ..ok },
            Spec { channels: 0, ..ok },
            Spec { bit_depth: 8, ..ok },
            Spec {
                sample_rate: 100,
                ..ok
            },
        ] {
            assert_eq!(bad.validate().unwrap_err().code(), "invalid_argument");
        }
    }
}
