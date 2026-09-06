import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import { MapPinOff, Layers, Store } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import { supabase } from "@/lib/supabase";
import { tokenColor, useResolvedTheme } from "@/lib/theme";
import {
  aggregate,
  GAZETTEER_SIZE,
  INDIA_BOUNDS,
  toFeatureCollection,
  type Aggregation,
} from "@/lib/geo";
import {
  Badge,
  Empty,
  ErrorNote,
  Note,
  Page,
  PageHeader,
  Panel,
  ROW_HOVER,
  SkeletonList,
  Stack,
  Stat,
  Table,
} from "@/components/ui";

/**
 * B2 - GEOGRAPHIC DISTRIBUTION. Real rows, no schema change, no seed.
 *
 * Reads the same `vendor_profiles` rows the Vendors table lists, and is gated
 * to the same three roles for that reason (roles.ts, section "geography").
 * Read-only: there is no mutation on this page.
 *
 * WHY MAPLIBRE. Google's Maps JavaScript Heatmap Layer is deprecated and no
 * longer available, so it is not an option regardless of preference. MapLibre
 * GL is the maintained BSD-licensed fork of Mapbox GL JS, renders a real
 * heatmap layer on the GPU, and needs no API key for raster basemap tiles.
 *
 * WHERE THE POINTS COME FROM. `vendor_profiles` has no coordinate columns, so
 * city and state text is resolved against the static gazetteer in lib/geo.ts.
 * That file carries the full note; the short version is that a vendor lands in
 * one of three buckets (exact city, state centroid, or unplaced) and this page
 * renders all three, because "we could not read the address" must never look
 * like "nobody is there".
 */

/**
 * OpenStreetMap raster tiles. No key, no account, and the attribution below is
 * required by the ODbL licence, so do not remove it.
 *
 * A vector style (MapTiler, Stadia, Protomaps) would look better and support a
 * true dark basemap, but every one of them needs an API key, which is an
 * account and a billing decision rather than a UI change. `VITE_MAP_STYLE_URL`
 * is the seam for that: set it and this page uses that style instead, with no
 * other change.
 */
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const CUSTOM_STYLE = import.meta.env.VITE_MAP_STYLE_URL as string | undefined;

const SUBTITLE = "Where Cosora's vendors are, aggregated from the city and state on each vendor profile.";

export default function Geography() {
  const vendors = useQuery({
    queryKey: ["geography-vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendor_profiles")
        .select("id, brand_name, city, state");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const agg: Aggregation | null = useMemo(
    () => (vendors.data ? aggregate(vendors.data) : null),
    [vendors.data],
  );

  if (vendors.isLoading) {
    return (
      <Page width="wide">
        <PageHeader title="Geography" subtitle={SUBTITLE} />
        <SkeletonList rows={1} height="h-[28rem]" />
      </Page>
    );
  }
  if (vendors.error) return <ErrorNote message={(vendors.error as Error).message} />;

  const a = agg!;
  const cityPoints = a.points.filter((p) => p.precision === "city").length;
  const statePoints = a.points.filter((p) => p.precision === "state").length;

  return (
    <Page width="wide">
      <PageHeader title="Geography" subtitle={SUBTITLE} />

      <Stack>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            icon={<Store size={18} />}
            label="Vendors on the map"
            value={a.placedCount.toLocaleString("en-IN")}
            sub={`of ${(a.placedCount + a.unplacedCount).toLocaleString("en-IN")} total`}
          />
          <Stat
            icon={<Layers size={18} />}
            label="Distinct locations"
            value={String(a.points.length)}
            sub={`${cityPoints} exact, ${statePoints} state-level`}
          />
          <Stat
            icon={<MapPinOff size={18} />}
            label="Address not recognised"
            value={a.unplacedCount.toLocaleString("en-IN")}
            tone={a.unplacedCount > 0 ? "caution" : undefined}
            sub={a.unplacedCount > 0 ? "listed below, not dropped" : "every address resolved"}
          />
          <Stat
            label="Densest location"
            value={a.points[0]?.label ?? "none"}
            sub={a.points[0] ? `${a.points[0].count} vendors` : undefined}
          />
        </div>

        <Panel
          title="Vendor density"
          description="Heat is the number of vendor profiles resolving to that point, not revenue, activity or order volume. Zoom and drag to explore."
          actions={
            <div className="flex items-center gap-2 text-2xs text-ink-faint">
              <span>fewer</span>
              <span
                aria-hidden
                className="h-2 w-24 rounded-sm"
                style={{
                  background:
                    "linear-gradient(90deg, rgb(var(--tone-info-dot) / 0.15), rgb(var(--tone-info-dot)), rgb(var(--tone-caution-dot)), rgb(var(--tone-critical-dot)))",
                }}
              />
              <span>more</span>
            </div>
          }
        >
          {a.points.length === 0 ? (
            <Empty>
              No vendor address could be placed, so there is nothing to plot. The addresses that
              could not be read are listed below.
            </Empty>
          ) : (
            <HeatMap agg={a} />
          )}
        </Panel>

        {statePoints > 0 && (
          <Note>
            <span className="font-semibold text-ink">
              {statePoints} of these {a.points.length} points are state centroids, not real
              addresses.
            </span>{" "}
            Those vendors named a state the gazetteer knows and a city it does not, so they are
            plotted at the geographic middle of that state. A cluster sitting in open country is
            this fallback, not a finding. They are marked{" "}
            <Badge tone="caution">approximate</Badge> in the table below.
          </Note>
        )}

        <Panel
          title="Locations by vendor count"
          description="Every point on the map, heaviest first."
        >
          <Table head={["Location", "State", "Vendors", "Precision"]}>
            {a.points.map((p) => (
              <tr key={p.key} className={ROW_HOVER}>
                <td className="px-3 py-2 font-medium text-ink">{p.label}</td>
                <td className="px-3 py-2 text-ink-muted">
                  {p.state || <span className="text-ink-ghost">not set</span>}
                </td>
                <td className="px-3 py-2 tabular-nums text-ink-muted">{p.count}</td>
                <td className="px-3 py-2">
                  {p.precision === "city" ? (
                    <Badge tone="positive">exact</Badge>
                  ) : (
                    <Badge tone="caution">approximate</Badge>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Panel>

        <Panel
          title="Addresses that could not be placed"
          description={`Neither the city nor the state matched the gazetteer, which currently covers ${GAZETTEER_SIZE.cities} places and ${GAZETTEER_SIZE.states} states and union territories. These vendors are counted here rather than dropped, so the map never claims a region is empty when it is only unreadable.`}
        >
          {a.unplaced.length === 0 ? (
            <Empty>Every vendor address resolved to a point.</Empty>
          ) : (
            <Table head={["City on the profile", "State on the profile", "Vendors"]}>
              {a.unplaced.map((u, i) => (
                <tr key={`${u.city}|${u.state}|${i}`} className={ROW_HOVER}>
                  <td className="px-3 py-2 text-ink">
                    {u.city || <span className="text-ink-ghost">blank</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-muted">
                    {u.state || <span className="text-ink-ghost">blank</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-ink-muted">{u.count}</td>
                </tr>
              ))}
            </Table>
          )}
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            Fixing one of these is a two-line addition to{" "}
            <span className="font-mono text-2xs">src/lib/geo.ts</span>, or a correction on the{" "}
            <Link to="/vendors" className="underline underline-offset-2 hover:text-ink">
              vendor's own profile
            </Link>{" "}
            when the address is simply wrong.
          </p>
        </Panel>
      </Stack>
    </Page>
  );
}

/* ------------------------------------------------------------------ *
 * The map itself
 * ------------------------------------------------------------------ */
function HeatMap({ agg }: { agg: Aggregation }) {
  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [failed, setFailed] = useState(false);
  const theme = useResolvedTheme();

  // One effect owns the map's whole lifetime, and it is keyed on the theme so a
  // mode switch rebuilds the style rather than leaving a light basemap under
  // dark chrome. MapLibre holds a WebGL context, so `remove()` in the cleanup
  // is load-bearing: without it, switching pages a few times exhausts the
  // browser's context limit and every later map renders blank.
  useEffect(() => {
    if (!container.current) return;

    let instance: MapLibreMap;
    try {
      instance = new maplibregl.Map({
        container: container.current,
        style: CUSTOM_STYLE ?? OSM_STYLE,
        bounds: INDIA_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true },
      });
    } catch {
      // No WebGL (a locked-down machine, a VM with no GPU passthrough). The
      // tables above still carry every number, so the page degrades to those.
      setFailed(true);
      return;
    }

    map.current = instance;
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("error", () => setFailed(true));

    instance.on("load", () => {
      instance.addSource("vendors", {
        type: "geojson",
        data: toFeatureCollection(agg.points),
      });

      // Basemap is reference, not content: desaturated in both modes and
      // darkened in dark mode, so the heat is the only saturated thing on
      // screen. A full-colour OSM basemap under a colour heatmap is unreadable.
      if (!CUSTOM_STYLE && instance.getLayer("osm")) {
        instance.setPaintProperty("osm", "raster-saturation", -0.85);
        instance.setPaintProperty("osm", "raster-contrast", theme === "dark" ? -0.15 : -0.25);
        instance.setPaintProperty("osm", "raster-brightness-max", theme === "dark" ? 0.42 : 1);
        instance.setPaintProperty("osm", "raster-brightness-min", theme === "dark" ? 0.03 : 0.15);
      }

      // Weight is normalised against the densest point, so one city with forty
      // vendors does not flatten the rest of the country to invisible.
      const max = Math.max(1, agg.maxCount);

      instance.addLayer({
        id: "vendor-heat",
        type: "heatmap",
        source: "vendors",
        maxzoom: 9,
        paint: {
          "heatmap-weight": ["interpolate", ["linear"], ["get", "count"], 0, 0, max, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 3, 1, 9, 3],
          // Transparent at zero so the basemap shows through where there is
          // nothing, rather than a blue wash implying a floor of activity.
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0,0,0,0)",
            0.2,
            tokenColor("tone-info-dot", 0.35),
            0.45,
            tokenColor("tone-info-dot", 0.75),
            0.7,
            tokenColor("tone-caution-dot", 0.85),
            1,
            tokenColor("tone-critical-dot", 0.9),
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 18, 9, 42],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.9, 9, 0],
        },
      });

      // Past the heatmap's zoom range the blur stops being informative, so the
      // same data becomes labelled circles you can click.
      instance.addLayer({
        id: "vendor-points",
        type: "circle",
        source: "vendors",
        minzoom: 7,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "count"], 1, 5, max, 20],
          "circle-color": tokenColor("tone-info-dot", 0.75),
          "circle-stroke-width": 1,
          "circle-stroke-color": tokenColor("surface"),
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 8, 1],
        },
      });

      const popup = new maplibregl.Popup({ closeButton: false, offset: 12 });
      instance.on("mouseenter", "vendor-points", (e) => {
        instance.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0];
        if (!f) return;
        const { label, count, precision } = f.properties as {
          label: string;
          count: number;
          precision: string;
        };
        const coords = (f.geometry as { coordinates: [number, number] }).coordinates;
        popup
          .setLngLat(coords)
          .setHTML(
            `<div style="font:500 12px system-ui">${label}</div>` +
              `<div style="font:400 11px system-ui;opacity:.7">${count} vendor${count === 1 ? "" : "s"}` +
              `${precision === "state" ? " · approximate, state centroid" : ""}</div>`,
          )
          .addTo(instance);
      });
      instance.on("mouseleave", "vendor-points", () => {
        instance.getCanvas().style.cursor = "";
        popup.remove();
      });
    });

    return () => {
      instance.remove();
      map.current = null;
    };
  }, [agg, theme]);

  if (failed) {
    return (
      <Note>
        The map could not start. That is usually WebGL being unavailable in this browser or on this
        machine. Every figure the map would show is in the tables on this page, so nothing is hidden
        by it.
      </Note>
    );
  }

  return (
    <div
      ref={container}
      className="h-[28rem] w-full overflow-hidden rounded-xl border border-line bg-surface-2"
      // The map is a visual summary of the table directly below it, which is
      // the accessible copy of the same data.
      role="img"
      aria-label={`Heat map of ${agg.placedCount} Cosora vendors across ${agg.points.length} locations in India. The same figures are listed in the table below.`}
    />
  );
}
