/// <reference types="@types/google.maps" />
import { useEffect, useRef } from 'react';
import './Map.scss';

// API key'i environment variable'dan al
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY;


declare global {
  interface Window {
    initMap: () => void;
  }
}

interface MapProps {
  center: {
    lat: number;
    lng: number;
  };
  location?: string;
  markers?: Array<{
    position: {
      lat: number;
      lng: number;
    };
    title?: string;
  }>;
  onDestinationSelect?: (location: { lat: number; lng: number }) => void;
}

export function Map({ center, location = 'My Location', markers = [], onDestinationSelect }: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const initializeMap = () => {
      if (!mapRef.current) return;

      const mapOptions: google.maps.MapOptions = {
        center,
        zoom: 15,
        styles: [
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
        ],
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
      };

      const map = new google.maps.Map(mapRef.current, mapOptions);
      mapInstanceRef.current = map;

      // Konum marker'ı
      const mainMarker = new google.maps.Marker({
        position: center,
        map: map,
        title: location,
        animation: google.maps.Animation.DROP,
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png'
        }
      });

      // Info window
      const infoWindow = new google.maps.InfoWindow({
        content: location
      });

      mainMarker.addListener('click', () => {
        infoWindow.open(map, mainMarker);
      });

      // Uzun basma olayını dinle
      if (onDestinationSelect) {
        map.addListener('mousedown', (e: google.maps.MapMouseEvent) => {
          const latLng = e.latLng;
          if (!latLng) return;
          
          longPressTimerRef.current = setTimeout(() => {
            const position = {
              lat: latLng.lat(),
              lng: latLng.lng()
            };
            onDestinationSelect(position);
          }, 500); // 500ms uzun basma süresi
        });

        map.addListener('mouseup', () => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
          }
        });

        map.addListener('dragstart', () => {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
          }
        });
      }
    };

    // Google Maps script yükleme
    if (!window.google) {
      window.initMap = initializeMap;
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=initMap`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    } else {
      initializeMap();
    }

    return () => {
      // Cleanup markers
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
    };
  }, [center, location]);

  // Marker'ları güncelle
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    // Önceki marker'ları temizle
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    // Yeni marker'ları ekle
    markers.forEach(marker => {
      const newMarker = new google.maps.Marker({
        position: marker.position,
        map: mapInstanceRef.current,
        title: marker.title,
        animation: google.maps.Animation.DROP,
        icon: {
          url: 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png'
        }
      });

      if (marker.title) {
        const infoWindow = new google.maps.InfoWindow({
          content: marker.title
        });

        newMarker.addListener('click', () => {
          infoWindow.open(mapInstanceRef.current, newMarker);
        });
      }

      markersRef.current.push(newMarker);
    });
  }, [markers]);

  return (
    <div data-component="Map">
      <div ref={mapRef} className="map-container" />
    </div>
  );
}
