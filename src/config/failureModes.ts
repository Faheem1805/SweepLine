/**
 * What can go wrong, what SweepLine does about it, and where the result comes from. A row with a
 * `run` is measured in the same bloom with and without SweepLine (scripts/study-all.sh); a row
 * without one is true by design and is said to be.
 */

export interface FailureMode {
  key: string;
  /** What fails or goes outside the design case. */
  failure: string;
  /** What SweepLine does. */
  response: string;
  /** Study case that measures it. */
  run?: string;
  /** The same fault with only one net, when that is the point of the row. */
  single?: string;
}

export const FAILURE_MODES: readonly FailureMode[] = [
  { key: 'tear', failure: 'A busy panel tears out', response: 'Net B, 60 m behind, catches what comes through', run: 'tearBusy', single: 'tearBusySingle' },
  { key: 'leak', failure: 'Mesh and joints leak 10× more than assumed', response: 'Net B catches nearly all of it', run: 'leak10', single: 'leak10Single' },
  { key: 'pumps', failure: 'Both screw lifts stop for over four hours', response: 'The bloom stacks on the net, which goes on holding it', run: 'pumps' },
  { key: 'overload', failure: 'Lifts down, panels 6 weeks old, and a bloom surge of 3×', response: 'The net holds it. Head stays near 16 mm, far below relief', run: 'overload' },
  { key: 'debris', failure: 'A debris mat blinds net A', response: 'At 0.12 m of head the float line dips and water spills over. Net B takes what crosses', run: 'debris' },
  { key: 'fouled', failure: 'Panels left in 10 weeks', response: 'Head rises, still far below relief. Load cells flag it', run: 'fouled' },
  { key: 'storm', failure: 'Biggest waves on record, Hs 1.82 m', response: 'A fifth of that reaches the net behind the breakwaters', run: 'storm' },
  { key: 'tide', failure: 'The tide turns mid-bloom', response: 'Nothing happens: the plant sets the flow in the channel', run: 'tide' },
  { key: 'moon', failure: 'Soft moon jellyfish instead', response: 'More leak past net A. Net B catches them', run: 'moon' },
  { key: 'deep', failure: 'A deep-living species', response: 'The nets run to the seabed', run: 'deep' },
  { key: 'duty', failure: 'The duty screws stop', response: 'The standby screws take over in 12 seconds; animals already in a duty screw wait there in their pockets of water' },
  { key: 'power', failure: 'Site power is lost', response: 'The nets need none. They hold the bloom until the lifts are back' },
  { key: 'sonar', failure: 'Sonar is lost', response: 'Warning only. The net works without it' },
];
