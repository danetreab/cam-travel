import { useEffect, useRef, useState } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { AutoComplete, Input, Typography } from "antd";
import { SearchOutlined } from "@ant-design/icons";

export type MapPickerValue = {
  latitude: number;
  longitude: number;
  googlePlaceId?: string | null;
  name?: string;
  description?: string | null;
  activityType?: string | null;
};

type Props = {
  value?: MapPickerValue | null;
  onChange?: (value: MapPickerValue) => void;
};

const CAMBODIA_CENTER = { lat: 12.5657, lng: 104.991 };

type PlaceOption = {
  value: string;
  label: string;
  placeId: string;
};

// Antd Input + dropdown backed by the modern `AutocompleteSuggestion` API
// (replaces the deprecated `places.Autocomplete` that was frozen for new
// customers on 2025-03-01). Keeps the antd visual treatment while paying
// the recommended migration path.
const PlaceSearch = ({
  onSelect,
}: {
  onSelect: (v: MapPickerValue) => void;
}) => {
  const placesLib = useMapsLibrary("places");
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const predictionsRef = useRef<
    Map<string, google.maps.places.PlacePrediction>
  >(new Map());
  // Session token groups query-phase requests with the eventual fetchFields
  // call for billing. Reset after each selection per Google's guidance.
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );

  const handleSearch = async (value: string) => {
    if (!placesLib || !value.trim()) {
      setOptions([]);
      return;
    }
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
    }
    const { suggestions } =
      await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: value,
        sessionToken: sessionTokenRef.current,
      });
    predictionsRef.current.clear();
    setOptions(
      suggestions
        .map((s) => s.placePrediction)
        .filter((p): p is google.maps.places.PlacePrediction => p !== null)
        .map((p) => {
          predictionsRef.current.set(p.placeId, p);
          return {
            placeId: p.placeId,
            value: p.text.text,
            label: p.text.text,
          };
        }),
    );
  };

  const handleSelect = async (_value: string, option: PlaceOption) => {
    const prediction = predictionsRef.current.get(option.placeId);
    if (!prediction) return;
    const place = prediction.toPlace();
    await place.fetchFields({
      fields: ["id", "displayName", "location", "types"],
    });
    // Session concludes with the first fetchFields call.
    sessionTokenRef.current = null;
    const loc = place.location;
    if (!loc) return;
    onSelect({
      latitude: loc.lat(),
      longitude: loc.lng(),
      googlePlaceId: place.id ?? null,
      name: place.displayName ?? undefined,
      activityType: inferActivityType(place.types ?? []),
    });
  };

  return (
    <AutoComplete<string, PlaceOption>
      options={options}
      onSearch={handleSearch}
      onSelect={handleSelect}
      style={{ width: "100%", marginBottom: 8 }}
    >
      <Input
        placeholder="Search a place (e.g. Angkor Wat)"
        prefix={<SearchOutlined />}
        allowClear
      />
    </AutoComplete>
  );
};

const inferActivityType = (types: string[]): string | undefined => {
  if (types.includes("place_of_worship") || types.includes("hindu_temple")) return "temple";
  if (types.includes("natural_feature") || types.includes("park")) return "hiking";
  if (types.includes("beach")) return "beach";
  if (types.includes("restaurant") || types.includes("food")) return "food";
  return undefined;
};

const MapClickHandler = ({
  onClick,
}: {
  onClick: (lat: number, lng: number) => void;
}) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      const ll = e.latLng;
      if (!ll) return;
      onClick(ll.lat(), ll.lng());
    });
    return () => {
      listener.remove();
    };
  }, [map, onClick]);
  return null;
};

export const MapPicker = ({ value, onChange }: Props) => {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId = (import.meta.env.VITE_GOOGLE_MAPS_ID as string | undefined) ?? "DEMO_MAP_ID";
  const [internal, setInternal] = useState<MapPickerValue | null>(value ?? null);

  // Sync external value changes (e.g. when the form loads existing data).
  useEffect(() => {
    if (
      value &&
      (value.latitude !== internal?.latitude || value.longitude !== internal?.longitude)
    ) {
      setInternal(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.latitude, value?.longitude]);

  if (!apiKey) {
    return (
      <Typography.Text type="danger">
        VITE_GOOGLE_MAPS_API_KEY is not set. Map picker disabled.
      </Typography.Text>
    );
  }

  const center = internal
    ? { lat: internal.latitude, lng: internal.longitude }
    : CAMBODIA_CENTER;

  const update = (next: MapPickerValue) => {
    setInternal(next);
    onChange?.(next);
  };

  return (
    <APIProvider apiKey={apiKey} libraries={["places"]}>
      <PlaceSearch onSelect={update} />
      <div style={{ width: "100%", height: 360, borderRadius: 8, overflow: "hidden" }}>
        <GoogleMap
          mapId={mapId}
          defaultCenter={center}
          defaultZoom={internal ? 14 : 7}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          <MapClickHandler
            onClick={(lat, lng) =>
              update({
                latitude: lat,
                longitude: lng,
                googlePlaceId: null,
                name: internal?.name,
              })
            }
          />
          {internal && (
            <AdvancedMarker
              position={{ lat: internal.latitude, lng: internal.longitude }}
            />
          )}
        </GoogleMap>
      </div>
      {internal && (
        <Typography.Text type="secondary" style={{ display: "block", marginTop: 8 }}>
          {internal.latitude.toFixed(5)}, {internal.longitude.toFixed(5)}
          {internal.googlePlaceId ? " · linked to Google Place" : ""}
        </Typography.Text>
      )}
    </APIProvider>
  );
};
