import { createElement, forwardRef, type HTMLAttributes, type JSX } from "react";
import styles from "./Surface.module.css";

export type SurfaceMaterial = "panel" | "raised" | "plate" | "inset" | "card" | "dialog" | "chrome";
export type SurfaceRadius = "none" | "lg" | "xl" | "2xl";

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  material: SurfaceMaterial;
  /** Adds a 16 px walnut strip on that edge. Panel only. */
  cheek?: "left" | "right";
  /** Overrides the material's default corner radius. */
  radius?: SurfaceRadius;
  /** Inner padding. Defaults to true for card, plate and dialog. */
  padded?: boolean;
  /** Element to render (`aside`, `section`, ...). Default `div`. */
  as?: keyof JSX.IntrinsicElements;
  /** Card only: adds the floating drop shadow. */
  floating?: boolean;
  /**
   * Which edge carries the 1px `--ph-line`. Chrome: `top` / `bottom` (default `bottom`, title bar; `top` for status bars).
   * Panel: `left` / `right`, the inner edge of a panel with no cheek (a panel with a cheek puts the line opposite it).
   */
  edge?: "top" | "bottom" | "left" | "right";
}

const PADDED_BY_DEFAULT: ReadonlySet<SurfaceMaterial> = new Set<SurfaceMaterial>(["card", "plate", "dialog"]);

/** One component for every background "material" so the skeuomorphic treatment stays consistent. */
export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface(
  { material, cheek, radius, padded, as = "div", floating = false, edge, className, children, ...rest },
  ref,
) {
  const isPadded = padded ?? PADDED_BY_DEFAULT.has(material);
  const cheekSide = material === "panel" ? cheek : undefined;
  const lineEdge = material === "chrome" ? (edge === "top" ? "top" : "bottom") : material === "panel" && !cheekSide ? edge : undefined;
  const classes = [styles["surface"], className].filter(Boolean).join(" ");

  return createElement(
    as,
    {
      ref,
      className: classes,
      "data-material": material,
      "data-radius": radius,
      "data-cheek": cheekSide,
      "data-padded": isPadded ? "" : undefined,
      "data-floating": material === "card" && floating ? "" : undefined,
      "data-edge": lineEdge,
      ...rest,
    },
    cheekSide ? <span className={styles["cheek"]} aria-hidden="true" /> : null,
    children,
  );
});
