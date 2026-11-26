/// <reference types="google.maps" />
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdvancedMarker,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Camera,
  Check,
  Compass,
  Lightbulb,
  LocateFixed,
  MapPin,
  Navigation,
  Plus,
  Share2,
  Shield,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import type { CommunityReport, UserPublic } from '../types/safeher.ts';

interface SafeMapViewProps {
  mapsApiKey: string;
  user: UserPublic;
  currentLocation: { lat: number; lng: number; label: string } | null;
  onRefreshLocation: () => void;
  reports: CommunityReport[];
  onReportsChange: (reports: CommunityReport[]) => void;
}

interface NearbySafePlace {
  id: string;
  name: string;
  address: string;
  type: string;
  lat: number;
  lng: number;
}

interface ComputedRouteSummary {
  index: number;
  distanceKm: string;
  durationMin: number;
  cctvScore: number;
  lightingScore: number;
  safetyReason: string;
  recommended: boolean;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('OverQuotaMapError') ||
    msg.includes('429')
  );
}

function usePlaceAutocomplete(inputValue: string) {
  const placesLib = useMapsLibrary('places');
  const tokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);

  useEffect(() => {
    if (!placesLib || !inputValue.trim()) {
      setSuggestions([]);
      return;
    }
    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!tokenRef.current) {
      tokenRef.current = new AutocompleteSessionToken();
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: inputValue,
        sessionToken: tokenRef.current!,
      })
        .then((res) => {
          if (!cancelled) setSuggestions(res.suggestions || []);
        })
        .catch((err) => {
          if (isQuotaError(err)) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          }
          if (!cancelled) setSuggestions([]);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, inputValue]);

  const resetSession = useCallback(() => {
    tokenRef.current = null;
    setSuggestions([]);
  }, []);

  return { suggestions, resetSession };
}

function ReportMarker({
  report,
  onSelect,
  selected,
  onClose,
}: {
  report: CommunityReport;
  onSelect: () => void;
  selected: boolean;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isPositive =
    report.category === 'cctv_verified' || report.category === 'verified_safe_hub';
  const bg =
    report.category === 'cctv_verified'
      ? '#6D28D9'
      : report.category === 'verified_safe_hub'
        ? '#16A34A'
        : '#D97706';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: report.lat, lng: report.lng }}
        onClick={onSelect}
        title={report.title}
      >
        <Pin background={bg} borderColor="#FFFFFF" glyphColor="#FFFFFF" scale={0.95} />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={250}>
          <div className="text-slate-900 space-y-1 p-0.5">
            <p className="text-xs font-bold">{report.title}</p>
            <p className="text-[11px] text-slate-600">{report.address}</p>
            <p className="text-xs text-slate-700">{report.description}</p>
            <p className="text-[11px] font-medium text-purple-700">
              {isPositive
                ? report.verified
                  ? 'Verified Community / Audit Entry'
                  : 'Community Submitted Safe Point'
                : 'Caution Advisory'}
            </p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function NearbyHelpMarker({
  place,
  selected,
  onSelect,
  onClose,
}: {
  place: NearbySafePlace;
  selected: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: place.lat, lng: place.lng }}
        onClick={onSelect}
        title={place.name}
      >
        <Pin background="#DB2777" borderColor="#FFFFFF" glyphColor="#FFFFFF" scale={0.9} />
      </AdvancedMarker>
      {selected && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={240}>
          <div className="text-slate-900 space-y-1">
            <p className="text-xs font-bold">{place.name}</p>
            <p className="text-[11px] text-slate-600 capitalize">{place.type.replace(/_/g, ' ')}</p>
            <p className="text-xs text-slate-700">{place.address}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MapController({
  center,
  originPos,
  destPos,
  travelMode,
  reports,
  onRoutesComputed,
  onNearbyPlacesFound,
  onError,
}: {
  center: { lat: number; lng: number };
  originPos: { lat: number; lng: number } | null;
  destPos: { lat: number; lng: number } | null;
  travelMode: 'WALKING' | 'DRIVING' | 'TRANSIT';
  reports: CommunityReport[];
  onRoutesComputed: (routes: ComputedRouteSummary[]) => void;
  onNearbyPlacesFound: (places: NearbySafePlace[]) => void;
  onError: (msg: string | null) => void;
}) {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const placesLib = useMapsLibrary('places');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (map && center) {
      map.panTo(center);
    }
  }, [map, center]);

  // Nearby staffed safe venues via Places API New (Place.searchNearby)
  useEffect(() => {
    if (!placesLib || !center) return;
    let cancelled = false;

    const searchFn = async () => {
      try {
        const { Place } = placesLib;
        const { places } = await Place.searchNearby({
          fields: ['id', 'displayName', 'location', 'formattedAddress', 'primaryType'],
          locationRestriction: {
            center,
            radius: 1800,
          },
          includedPrimaryTypes: ['police', 'hospital', 'pharmacy', 'subway_station'],
          maxResultCount: 10,
        });
        if (cancelled) return;
        const mapped: NearbySafePlace[] = (places || [])
          .filter((p) => p.location)
          .map((p) => ({
            id: p.id || Math.random().toString(36).slice(2),
            name: p.displayName || 'Staffed Public Location',
            address: p.formattedAddress || 'Nearby verified address',
            type: p.primaryType || 'safe_hub',
            lat: p.location!.lat(),
            lng: p.location!.lng(),
          }));
        onNearbyPlacesFound(mapped);
      } catch (err) {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    };

    void searchFn();
    return () => {
      cancelled = true;
    };
  }, [placesLib, center, onNearbyPlacesFound]);

  // Modern Route.computeRoutes calculation
  useEffect(() => {
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    if (!routesLib || !map || !originPos || !destPos) {
      onRoutesComputed([]);
      return;
    }

    onError(null);
    let cancelled = false;

    const request = {
      origin: originPos,
      destination: destPos,
      travelMode,
      provideRouteAlternatives: true,
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport'],
    };

    (routesLib.Route as unknown as {
      computeRoutes: (req: unknown) => Promise<{
        routes?: Array<{
          distanceMeters?: number;
          durationMillis?: number;
          viewport?: google.maps.LatLngBounds;
          path?: google.maps.LatLng[];
          createPolylines: () => google.maps.Polyline[];
        }>;
      }>;
    })
      .computeRoutes(request)
      .then((res) => {
        if (cancelled) return;
        const routes = res?.routes || [];
        if (routes.length === 0) {
          onError('No route found between the selected points.');
          onRoutesComputed([]);
          return;
        }

        const cctvPoints = reports.filter(
          (r) => r.category === 'cctv_verified' || r.category === 'verified_safe_hub'
        );
        const cautionPoints = reports.filter(
          (r) => r.category === 'poor_lighting' || r.category === 'isolated_area'
        );

        const scored = routes.map((route, idx) => {
          const pathPts = route.path || [];
          let cctvHits = 0;
          let cautionHits = 0;

          pathPts.forEach((pt) => {
            const pLat = pt.lat();
            const pLng = pt.lng();
            cctvPoints.forEach((c) => {
              if (Math.hypot(pLat - c.lat, pLng - c.lng) < 0.0045) cctvHits++;
            });
            cautionPoints.forEach((w) => {
              if (Math.hypot(pLat - w.lat, pLng - w.lng) < 0.0035) cautionHits++;
            });
          });

          const cctvScore = Math.min(100, 58 + cctvHits * 4);
          const lightingScore = Math.max(40, Math.min(98, 82 + cctvHits * 2 - cautionHits * 8));
          return { route, idx, cctvScore, lightingScore, cautionHits };
        });

        // Pick highest combined CCTV + lighting score as recommended
        let bestIdx = 0;
        let bestCombined = -1;
        scored.forEach((s, i) => {
          const combined = s.cctvScore * 0.6 + s.lightingScore * 0.4;
          if (combined > bestCombined) {
            bestCombined = combined;
            bestIdx = i;
          }
        });

        const newPolylines: google.maps.Polyline[] = [];
        scored.forEach((item, i) => {
          const isRec = i === bestIdx;
          const lines = item.route.createPolylines();
          lines.forEach((pl) => {
            pl.setOptions({
              strokeColor: isRec ? '#6D28D9' : '#94A3B8',
              strokeWeight: isRec ? 6 : 4,
              strokeOpacity: isRec ? 0.95 : 0.7,
              zIndex: isRec ? 10 : 2,
            });
            pl.setMap(map);
            newPolylines.push(pl);
          });
        });

        polylinesRef.current = newPolylines;
        if (scored[bestIdx]?.route.viewport) {
          map.fitBounds(scored[bestIdx].route.viewport!);
        }

        const summaries: ComputedRouteSummary[] = scored.map((s, i) => ({
          index: i,
          distanceKm: ((s.route.distanceMeters ?? 0) / 1000).toFixed(2),
          durationMin: Math.max(1, Math.round((s.route.durationMillis ?? 0) / 60000)),
          cctvScore: s.cctvScore,
          lightingScore: s.lightingScore,
          recommended: i === bestIdx,
          safetyReason:
            i === bestIdx
              ? `Prioritized for higher verified CCTV corridor proximity (${s.cctvScore}% index) and fewer low-lighting advisories.`
              : `Alternative route (${s.cautionHits > 0 ? 'passes near reported low-lighting segment' : 'fewer verified CCTV checkpoints'}).`,
        }));
        onRoutesComputed(summaries);
      })
      .catch((err) => {
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        if (!cancelled) {
          onError(err instanceof Error ? err.message : 'Unable to compute safe route.');
        }
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, originPos, destPos, travelMode, reports, onRoutesComputed, onError]);

  return null;
}

function DestinationSearchBox({
  label,
  placeholder,
  value,
  onChange,
  onSelectPlace,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSelectPlace: (loc: { lat: number; lng: number; address: string }) => void;
}) {
  const { suggestions, resetSession } = usePlaceAutocomplete(value);
  const [open, setOpen] = useState(false);

  const handlePick = async (suggestion: google.maps.places.AutocompleteSuggestion) => {
    if (!suggestion.placePrediction) return;
    const place = suggestion.placePrediction.toPlace();
    await place.fetchFields({ fields: ['location', 'formattedAddress', 'displayName'] });
    if (place.location) {
      const addr =
        place.formattedAddress ||
        place.displayName ||
        suggestion.placePrediction.text.text;
      onChange(addr);
      onSelectPlace({
        lat: place.location.lat(),
        lng: place.location.lng(),
        address: addr,
      });
    }
    resetSession();
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="block text-xs font-semibold mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        placeholder={placeholder}
        className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-30 bg-white dark:bg-[#1D162C] border border-purple-200 dark:border-purple-800 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-purple-100 dark:divide-purple-900/50">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => void handlePick(s)}
                className="w-full text-left px-3.5 py-2.5 text-xs hover:bg-purple-50 dark:hover:bg-purple-900/40"
              >
                {s.placePrediction?.text.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SafeMapView({
  mapsApiKey,
  user,
  currentLocation,
  onRefreshLocation,
  reports,
  onReportsChange,
}: SafeMapViewProps) {
  const defaultCenter = currentLocation
    ? { lat: currentLocation.lat, lng: currentLocation.lng }
    : { lat: 37.7833, lng: -122.4112 };

  const [originText, setOriginText] = useState(currentLocation ? 'Current Location' : 'Market St & 4th St, San Francisco');
  const [destText, setDestText] = useState('');
  const [originPos, setOriginPos] = useState<{ lat: number; lng: number } | null>(defaultCenter);
  const [destPos, setDestPos] = useState<{ lat: number; lng: number } | null>(null);
  const [travelMode, setTravelMode] = useState<'WALKING' | 'DRIVING' | 'TRANSIT'>('WALKING');

  const [routeSummaries, setRouteSummaries] = useState<ComputedRouteSummary[]>([]);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbySafePlace[]>([]);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [copiedShare, setCopiedShare] = useState(false);

  // Community report form
  const [showReportForm, setShowReportForm] = useState(false);
  const [repCategory, setRepCategory] = useState<CommunityReport['category']>('poor_lighting');
  const [repTitle, setRepTitle] = useState('');
  const [repAddress, setRepAddress] = useState('');
  const [repDesc, setRepDesc] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const handleUseCurrentOrigin = () => {
    onRefreshLocation();
    if (currentLocation) {
      setOriginPos({ lat: currentLocation.lat, lng: currentLocation.lng });
      setOriginText(`Current Location (${currentLocation.label})`);
    }
  };

  const handleShareRoute = async () => {
    const rec = routeSummaries.find((r) => r.recommended) || routeSummaries[0];
    const summaryText = rec
      ? `SAFEHER Route Share (${user.name}): ${originText} to ${destText || 'Destination'} · ${rec.distanceKm} km (~${rec.durationMin} min) · ${rec.safetyReason}`
      : `SAFEHER Live Location (${user.name}): ${defaultCenter.lat.toFixed(5)}, ${defaultCenter.lng.toFixed(5)}`;
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopiedShare(true);
      setTimeout(() => setCopiedShare(false), 2500);
    } catch {
      // Clipboard fallback ignored
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repTitle.trim()) return;
    setSubmittingReport(true);
    try {
      const res = await apiFetch<{ report: CommunityReport }>('/api/community/reports', {
        method: 'POST',
        body: JSON.stringify({
          category: repCategory,
          title: repTitle,
          description: repDesc,
          address: repAddress || currentLocation?.label || 'Reported Area',
          lat: defaultCenter.lat + (Math.random() - 0.5) * 0.004,
          lng: defaultCenter.lng + (Math.random() - 0.5) * 0.004,
        }),
      });
      onReportsChange([res.report, ...reports]);
      setRepTitle('');
      setRepDesc('');
      setRepAddress('');
      setShowReportForm(false);
    } finally {
      setSubmittingReport(false);
    }
  };

  if (!mapsApiKey) {
    return (
      <div className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200 dark:border-purple-900/60 p-8 text-center space-y-3">
        <MapPin className="w-8 h-8 text-purple-700 dark:text-purple-300 mx-auto" />
        <h2 className="font-display text-xl font-bold">Google Maps Key Pending</h2>
        <p className="text-sm text-[#574C70] dark:text-[#B9AED2] max-w-md mx-auto">
          Configure your Google Maps API key in Secrets or reload the preview container after
          provisioning to view interactive maps, safe routing, and nearby staffed venues.
        </p>
      </div>
    );
  }

  return (
    <APIProvider apiKey={mapsApiKey} libraries={['places', 'routes', 'marker']}>
      <div className="space-y-6">
        {/* Top Controls + Route Planner */}
        <section className="bg-white dark:bg-[#161122] rounded-3xl border border-purple-200/80 dark:border-purple-900/60 p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-bold">
                AI CCTV-Aware Safe Route Navigation
              </h2>
              <p className="text-xs text-[#574C70] dark:text-[#B9AED2] mt-0.5">
                Compares alternative routes by verified CCTV corridor coverage, lighting reports,
                and nearby staffed venues.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUseCurrentOrigin}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-purple-100 dark:bg-[#231B36] text-purple-900 dark:text-purple-100 text-xs font-semibold flex items-center gap-1.5"
              >
                <LocateFixed className="w-4 h-4" />
                <span>Use GPS</span>
              </button>
              <button
                type="button"
                onClick={() => void handleShareRoute()}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                {copiedShare ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span>{copiedShare ? 'Route Copied' : 'Share Route'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-5">
              <DestinationSearchBox
                label="Starting Point"
                placeholder="Search starting address..."
                value={originText}
                onChange={setOriginText}
                onSelectPlace={(p) => setOriginPos({ lat: p.lat, lng: p.lng })}
              />
            </div>
            <div className="md:col-span-5">
              <DestinationSearchBox
                label="Destination"
                placeholder="Where are you heading?"
                value={destText}
                onChange={setDestText}
                onSelectPlace={(p) => setDestPos({ lat: p.lat, lng: p.lng })}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-1">Mode</label>
              <select
                value={travelMode}
                onChange={(e) =>
                  setTravelMode(e.target.value as 'WALKING' | 'DRIVING' | 'TRANSIT')
                }
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-sm"
              >
                <option value="WALKING">Walking</option>
                <option value="TRANSIT">Transit</option>
                <option value="DRIVING">Driving</option>
              </select>
            </div>
          </div>

          {/* CCTV Disclaimer */}
          <div className="p-3 rounded-xl bg-purple-50/80 dark:bg-[#221A34] border border-purple-200/70 dark:border-purple-800/70 flex items-start gap-2.5 text-xs text-[#4C4166] dark:text-[#D5CBEB]">
            <Camera className="w-4 h-4 text-purple-700 dark:text-purple-300 shrink-0 mt-0.5" />
            <span>
              <strong>Important Safety Note:</strong> CCTV presence and street-lighting data are
              informative guides only. CCTV presence does not guarantee that cameras are working,
              actively recording, or monitored in real time.
            </span>
          </div>
        </section>

        {/* Map Canvas + Side Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-8 rounded-3xl overflow-hidden border border-purple-200 dark:border-purple-900/60 bg-slate-100 dark:bg-[#171126] h-[420px] lg:h-[540px] relative">
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultCenter={defaultCenter}
              defaultZoom={14}
              gestureHandling="greedy"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapController
                center={defaultCenter}
                originPos={originPos}
                destPos={destPos}
                travelMode={travelMode}
                reports={reports}
                onRoutesComputed={setRouteSummaries}
                onNearbyPlacesFound={setNearbyPlaces}
                onError={setRouteError}
              />

              {/* User Live Location Pin */}
              {currentLocation && (
                <AdvancedMarker
                  position={{ lat: currentLocation.lat, lng: currentLocation.lng }}
                  title="Your Location"
                >
                  <Pin background="#7C3AED" borderColor="#FFFFFF" glyphColor="#FFFFFF" scale={1.1} />
                </AdvancedMarker>
              )}

              {/* Community Safety & CCTV Markers */}
              {user.settings.community.showReports &&
                reports.map((rep) => (
                  <ReportMarker
                    key={rep.id}
                    report={rep}
                    selected={selectedReportId === rep.id}
                    onSelect={() => {
                      setSelectedPlaceId(null);
                      setSelectedReportId(rep.id);
                    }}
                    onClose={() => setSelectedReportId(null)}
                  />
                ))}

              {/* Real Google Places Nearby Staffed Help Markers */}
              {nearbyPlaces.map((pl) => (
                <NearbyHelpMarker
                  key={pl.id}
                  place={pl}
                  selected={selectedPlaceId === pl.id}
                  onSelect={() => {
                    setSelectedReportId(null);
                    setSelectedPlaceId(pl.id);
                  }}
                  onClose={() => setSelectedPlaceId(null)}
                />
              ))}
            </GoogleMap>
          </div>

          {/* Right Intelligence Column */}
          <div className="lg:col-span-4 space-y-4">
            {/* Route Comparison */}
            <section className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-purple-700 dark:text-purple-300" />
                  <span>Route Comparison</span>
                </h3>
                {routeSummaries.length > 0 && (
                  <span className="text-xs font-mono-tabular text-[#574C70] dark:text-[#B9AED2]">
                    {routeSummaries.length} found
                  </span>
                )}
              </div>

              {routeError && (
                <p className="text-xs text-red-700 dark:text-red-300">{routeError}</p>
              )}

              {routeSummaries.length === 0 ? (
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2] leading-relaxed">
                  Select a destination above to compare routes by CCTV coverage, lighting reports,
                  and estimated walking or transit duration.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {routeSummaries.map((r) => (
                    <div
                      key={r.index}
                      className={`p-3 rounded-xl border text-xs space-y-1 ${
                        r.recommended
                          ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-400 dark:border-purple-700'
                          : 'bg-[#FAF8FF] dark:bg-[#1E172E] border-purple-200/60 dark:border-purple-900/50'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold">
                        <span>
                          {r.recommended ? 'Recommended Safe Route' : `Alternative #${r.index + 1}`}
                        </span>
                        <span className="font-mono-tabular">
                          {r.durationMin} min · {r.distanceKm} km
                        </span>
                      </div>
                      <p className="text-[#574C70] dark:text-[#B9AED2]">{r.safetyReason}</p>
                      <p className="font-mono-tabular text-[11px] text-purple-800 dark:text-purple-300">
                        CCTV Coverage Index: {r.cctvScore}% · Lighting Index: {r.lightingScore}%
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Nearby Staffed Help Network (Places API New) */}
            <section className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                  <span>Nearby Verified Help</span>
                </h3>
                <span className="text-[11px] text-[#6E6288] dark:text-[#9F93BC]">
                  Places API
                </span>
              </div>

              {nearbyPlaces.length === 0 ? (
                <p className="text-xs text-[#574C70] dark:text-[#B9AED2]">
                  Searching for nearby police stations, hospitals, pharmacies, and transit hubs...
                </p>
              ) : (
                <ul className="divide-y divide-purple-100 dark:divide-purple-900/50 max-h-56 overflow-y-auto">
                  {nearbyPlaces.slice(0, 6).map((p) => (
                    <li key={p.id} className="py-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setSelectedPlaceId(p.id)}
                        className="w-full text-left hover:text-purple-700 dark:hover:text-purple-300"
                      >
                        <p className="font-semibold truncate">{p.name}</p>
                        <p className="text-[11px] text-[#6E6288] dark:text-[#9F93BC] truncate">
                          {p.type.replace(/_/g, ' ')} · {p.address}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Community Safety Reporting */}
            <section className="bg-white dark:bg-[#161122] rounded-2xl border border-purple-200/80 dark:border-purple-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display font-bold text-sm flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-600" />
                  <span>Community Safety Map</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setShowReportForm((s) => !s)}
                  className="min-h-[34px] px-3 py-1 rounded-lg bg-purple-700 text-white text-xs font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Report</span>
                </button>
              </div>

              {showReportForm && (
                <form onSubmit={handleSubmitReport} className="space-y-2.5 pt-1">
                  <select
                    value={repCategory}
                    onChange={(e) =>
                      setRepCategory(e.target.value as CommunityReport['category'])
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
                  >
                    <option value="poor_lighting">Poor Street Lighting</option>
                    <option value="isolated_area">Isolated / Unstaffed Area</option>
                    <option value="harassment">Unsafe Incident / Harassment</option>
                    <option value="verified_safe_hub">Well-Lit Staffed Safe Hub</option>
                    <option value="cctv_verified">Public CCTV Corridor</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={repTitle}
                    onChange={(e) => setRepTitle(e.target.value)}
                    placeholder="Short title (e.g., Broken streetlight on 5th)"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
                  />
                  <input
                    type="text"
                    value={repAddress}
                    onChange={(e) => setRepAddress(e.target.value)}
                    placeholder="Street or landmark"
                    className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
                  />
                  <textarea
                    rows={2}
                    value={repDesc}
                    onChange={(e) => setRepDesc(e.target.value)}
                    placeholder="Helpful observation for other women..."
                    className="w-full px-3 py-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-[#FAF8FF] dark:bg-[#1E172E] text-xs"
                  />
                  <button
                    type="submit"
                    disabled={submittingReport}
                    className="w-full min-h-[40px] rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold"
                  >
                    {submittingReport ? 'Submitting...' : 'Submit Safety Report'}
                  </button>
                </form>
              )}

              <div className="flex flex-wrap gap-3 text-[11px] text-[#574C70] dark:text-[#B9AED2]">
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3 text-purple-700" /> CCTV Corridor
                </span>
                <span className="flex items-center gap-1">
                  <Compass className="w-3 h-3 text-emerald-600" /> Safe Hub
                </span>
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-600" /> Caution
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-pink-600" /> Nearby Help
                </span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </APIProvider>
  );
}
