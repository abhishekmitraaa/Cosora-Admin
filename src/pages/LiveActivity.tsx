import { ExternalLink } from "lucide-react";
import {
  Button,
  Notice,
  Note,
  Page,
  PageHeader,
  Panel,
  Stack,
} from "@/components/ui";

/**
 * PART D - LIVE WEBSITE TRACTION.
 *
 * THIS IS A LINK, NOT A FEATURE. No Cosora schema, no query, no table, no
 * tracking code in this repo. Visitor analytics is a solved third-party
 * problem and building a custom one would mean a page-view table, a session
 * model, a bot filter and a consent story, all to reproduce something free.
 *
 * MICROSOFT CLARITY, NOT POSTHOG. One, not both, because two analytics scripts
 * on the buyer site means two consent banners, two sets of numbers that
 * disagree, and twice the page weight on the mobile connections this
 * marketplace actually runs on. Clarity wins here on three specifics:
 *
 *   - It is free with no event cap. PostHog's free tier meters events, and a
 *     marketplace with a video feed generates a lot of them.
 *   - Session recordings and heatmaps are the core product, not an add-on.
 *     "Which part of the RFQ form do vendors abandon" is the question this
 *     panel's users actually have, and that is a recording question.
 *   - It needs no self-hosting decision.
 *
 * PostHog is the better choice if the need turns out to be product analytics
 * (funnels, cohorts, feature flags) rather than watching sessions. Switching is
 * a change to one URL here plus the script on the buyer site.
 *
 * NO IFRAME. Clarity's dashboard sends `X-Frame-Options: SAMEORIGIN` and is
 * behind a Microsoft account login, so an embed renders a blank box or a login
 * page. A blank box that is supposed to be a dashboard is worse than a link, so
 * this is a clearly labelled link out.
 *
 * roles.ts, section "traction": every role, matching `reports`. Write: nobody,
 * because there is nothing here to write.
 */

/**
 * The Clarity project id, from the environment rather than hardcoded: it
 * differs between the staging and production properties, and it is not a
 * secret (it ships in the buyer site's own tracking snippet).
 */
const PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;

const DASHBOARD = PROJECT_ID
  ? `https://clarity.microsoft.com/projects/view/${PROJECT_ID}/dashboard`
  : "https://clarity.microsoft.com/projects";

const RECORDINGS = PROJECT_ID
  ? `https://clarity.microsoft.com/projects/view/${PROJECT_ID}/impressions`
  : null;

const HEATMAPS = PROJECT_ID
  ? `https://clarity.microsoft.com/projects/view/${PROJECT_ID}/heatmaps`
  : null;

export default function LiveActivity() {
  return (
    <Page>
      <PageHeader
        title="Live Activity"
        subtitle="Visitor traffic and session recordings for the buyer-facing site, in Microsoft Clarity."
      />

      <Stack>
        {!PROJECT_ID && (
          <Notice tone="caution" title="Clarity is not configured yet">
            <p className="mt-1">
              Set <span className="font-mono text-2xs">VITE_CLARITY_PROJECT_ID</span> in this panel's{" "}
              <span className="font-mono text-2xs">.env</span> to the Clarity project id, and add the
              Clarity tracking snippet to textile-spark-net's{" "}
              <span className="font-mono text-2xs">index.html</span>. Until both are done the links
              below go to the Clarity project list rather than straight to Cosora's dashboard, and
              there is no traffic data to see.
            </p>
          </Notice>
        )}

        <Panel
          title="Open the dashboard"
          description="Traffic, referrers, devices, rage clicks and dead clicks, plus session recordings of real visits."
        >
          <div className="flex flex-wrap gap-2">
            <a href={DASHBOARD} target="_blank" rel="noopener noreferrer">
              <Button variant="primary">
                Open Clarity <ExternalLink size={14} />
              </Button>
            </a>
            {RECORDINGS && (
              <a href={RECORDINGS} target="_blank" rel="noopener noreferrer">
                <Button>
                  Session recordings <ExternalLink size={14} />
                </Button>
              </a>
            )}
            {HEATMAPS && (
              <a href={HEATMAPS} target="_blank" rel="noopener noreferrer">
                <Button>
                  Heatmaps <ExternalLink size={14} />
                </Button>
              </a>
            )}
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            These open in a new tab and need a Microsoft account with access to the Cosora Clarity
            project. Signing in to this admin panel does not sign you in there.
          </p>
        </Panel>

        {/*
          Said plainly, because the obvious next question when someone sees a
          nav item called Live Activity is "why is the data not on this page".
        */}
        <Note>
          <span className="font-semibold text-ink">Why this is a link and not a dashboard.</span>{" "}
          Clarity's pages send an <span className="font-mono text-2xs">X-Frame-Options</span> header
          that blocks framing, and they sit behind a separate Microsoft login, so an embed here would
          render an empty box or a sign-in screen. A blank panel that is supposed to be a dashboard
          is worse than an honest link, so this page does not pretend to be one.
          <br />
          <br />
          Nothing on this page reads Cosora's database. There is no visitor tracking in this repo and
          none was added: page views, sessions and bot filtering are a solved third-party problem, and
          rebuilding them here would mean a new table, a session model and a consent story to
          reproduce something that already exists.
        </Note>

        <Panel
          title="One analytics tool, deliberately"
          description="Clarity was picked over PostHog and only one is wired up."
        >
          <ul className="space-y-2 text-sm leading-relaxed text-ink-muted">
            <li>
              <span className="font-medium text-ink">Two would be worse than one.</span> Two scripts
              on the buyer site means two consent banners, two sets of numbers that disagree in
              meetings, and twice the page weight on the mobile connections this marketplace runs on.
            </li>
            <li>
              <span className="font-medium text-ink">Clarity is free with no event cap</span>, and a
              buyer feed built around video generates a lot of events. PostHog's free tier meters
              them.
            </li>
            <li>
              <span className="font-medium text-ink">Recordings are the point.</span> The question
              this panel's users have is "where in the RFQ form do vendors give up", and that is a
              session-recording question rather than a funnel one.
            </li>
            <li>
              <span className="font-medium text-ink">PostHog is the better answer</span> if the need
              turns out to be product analytics: funnels, cohorts and feature flags. Switching is one
              URL in this file plus the snippet on the buyer site.
            </li>
          </ul>
        </Panel>
      </Stack>
    </Page>
  );
}
