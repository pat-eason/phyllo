import type { Meta, StoryObj } from "@storybook/react-vite";
import { useProject } from "../../hooks";

/** Smoke story: proves the app Storybook wires ThemeProvider + mock PhylloProvider. */
function ProjectProbe() {
  const { project } = useProject();
  return (
    <div style={{ padding: 24, background: "var(--ph-bg)", color: "var(--ph-text)", minHeight: "100vh" }}>
      <p>
        {project.name} · {project.tracks.length} tracks · {project.tempo.bpm} BPM
      </p>
    </div>
  );
}

const meta = {
  title: "App/Providers",
  component: ProjectProbe,
} satisfies Meta<typeof ProjectProbe>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MockStores: Story = {};
