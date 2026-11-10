import { useApp } from '../app/store';
import { Inspector } from '../components/panels/Inspector';
import { EventLogMenu, LiveHeadline, MarginsCard, PipelineStrip, ProblemMenu, WhatIfMenu } from '../components/panels/LivePanels';
import { CompareOverlay, FlowLegend, TideCard, UnderwaterHud, ViewportToolbar } from '../components/viewport/Hud';
import { LiftCard } from '../components/viewport/LiftCard';
import { ViewportSlot } from '../components/viewport/ViewportSlot';

/**
 * 01 — Live Simulation: the 3D twin fills the page. The left states the result, the bottom follows
 * the bloom from the sea to the release point, and the top right, next to the camera toolbar, opens
 * the problems a judge will ask about, each one a button that runs it.
 */
export function LiveSimulation() {
  const compare = useApp((s) => s.ui.compare);
  return (
    <div className="flex min-w-0 flex-1 p-3">
      <ViewportSlot className="min-h-[360px] flex-1 rounded-[16px] border border-line">
        <div data-live-hud className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute top-4 left-4 flex flex-col items-start gap-2.5">
            <LiveHeadline />
            <MarginsCard />
            <TideCard />
            <LiftCard />
            <FlowLegend />
          </div>
          <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
            <div className="flex items-start gap-1.5">
              <ViewportToolbar />
              <ProblemMenu />
            </div>
            <Inspector />
          </div>
          <UnderwaterHud />
          <CompareOverlay />
          <div className="absolute right-4 bottom-4 left-4 flex flex-col gap-2">
            <div className="flex items-end justify-end gap-2">
              <EventLogMenu />
              <WhatIfMenu />
            </div>
            {!compare && <PipelineStrip />}
          </div>
        </div>
      </ViewportSlot>
    </div>
  );
}
