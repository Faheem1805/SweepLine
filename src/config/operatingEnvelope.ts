import { ASSUMPTIONS } from './assumptions';

/**
 * What the operator watches, and where each limit comes from. The net is passive, so none of these
 * shuts anything down: they say how much margin is left and when to act.
 */
export const OPERATING_ENVELOPE = {
  /** Fish-screen practice (NMFS): through-screen speed at most 0.12 m/s. */
  approach: { label: 'Through-net speed', unit: 'm/s', near: 0.1, max: ASSUMPTIONS.screenCriteria.approachMax },
  /** Sweep must beat the through-net speed, or animals stop on the mesh. */
  sweep: { label: 'Sweep ÷ through-net', unit: '×', min: 1, near: 1.5 },
  /** Head across a net: the float line dips at `relief`. Assumption, to be set with the plant. */
  head: { label: 'Head across net', unit: 'm', near: ASSUMPTIONS.net.reliefHead * 0.6, relief: ASSUMPTIONS.net.reliefHead, design: ASSUMPTIONS.net.designHead },
  /** Share of the pockets' holding capacity in use. */
  pocket: { label: 'Collector pockets', unit: '%', near: 60, max: 100 },
  /** Wave height at the net line, after the breakwaters. */
  wave: { label: 'Waves at the net', unit: 'm', near: 0.5, max: 0.8 },
} as const;
