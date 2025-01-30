  const LOCAL_RELAY_SERVER_URL: string =
    process.env.REACT_APP_LOCAL_RELAY_SERVER_URL || '';

  import { useEffect, useRef, useCallback, useState } from 'react';

  import { RealtimeClient } from '@openai/realtime-api-beta';
  import { ItemType } from '@openai/realtime-api-beta/dist/lib/client.js';
  import { WavRecorder, WavStreamPlayer } from '../lib/wavtools/index.js';
  import { instructions } from '../utils/conversation_config.js';
  import { WavRenderer } from '../utils/wav_renderer';

  import { X, Edit, Zap, ArrowUp, ArrowDown, MapPin, AlertCircle } from 'react-feather';
  import { Button } from '../components/button/Button';
  import { Toggle } from '../components/toggle/Toggle';
  import { Map } from '../components/Map';
  import { seedSampleTaxis, findNearestTaxi, updateTaxiAvailability, type TaxiWithDistance } from '../utils/firebase';
  //import type { Product } from '../utils/firebase';

  import './ConsolePage.scss';
  import { isJsxOpeningLikeElement } from 'typescript';

 

  interface Coordinates {
    lat: number;
    lng: number;
    location?: string;
    temperature?: {
      value: number;
      units: string;
    };
    wind_speed?: {
      value: number;
      units: string;
    };
  }

  /**
   * Type for all event logs
   */
  interface RealtimeEvent {
    time: string;
    source: 'client' | 'server';
    count?: number;
    event: { [key: string]: any };
  }

  export function ConsolePage() {
    /**
     * Ask user for API Key
     * If we're using the local relay server, we don't need this
     */
    const getStoredApiKey = () => {
      const storedKey = localStorage.getItem('tmp::voice_api_key');
      if (storedKey) return storedKey;
      
      const newKey = prompt('OpenAI API Key');
      if (newKey) {
        localStorage.setItem('tmp::voice_api_key', newKey);
        return newKey;
      }
      return '';
    };

    const apiKey = LOCAL_RELAY_SERVER_URL ? '' : getStoredApiKey();

    /**
     * Instantiate:
     * - WavRecorder (speech input)
     * - WavStreamPlayer (speech output)
     * - RealtimeClient (API client)
     */
    const wavRecorderRef = useRef<WavRecorder>(
      new WavRecorder({ sampleRate: 21500 })
    );
    const wavStreamPlayerRef = useRef<WavStreamPlayer>(
      new WavStreamPlayer({ sampleRate: 21500 })
    );
    const clientRef = useRef<RealtimeClient>(
      new RealtimeClient(
        LOCAL_RELAY_SERVER_URL
          ? { url: LOCAL_RELAY_SERVER_URL }
          : {
              apiKey: apiKey,
              dangerouslyAllowAPIKeyInBrowser: true,
            }
      )
    );

    /**
     * References for
     * - Rendering audio visualization (canvas)
     * - Autoscrolling event logs
     * - Timing delta for event log displays
     */
    const clientCanvasRef = useRef<HTMLCanvasElement>(null);
    const serverCanvasRef = useRef<HTMLCanvasElement>(null);
    const eventsScrollHeightRef = useRef(0);
    const eventsScrollRef = useRef<HTMLDivElement>(null);
    const startTimeRef = useRef<string>(new Date().toISOString());

    /**
     * All of our variables for displaying application state
     * - items are all conversation items (dialog)
     * - realtimeEvents are event logs, which can be expanded
     * - memoryKv is for set_memory() function
     * - coords, marker are for get_weather() function
     */
    const [items, setItems] = useState<ItemType[]>([]);
    const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEvent[]>([]);
    const [expandedEvents, setExpandedEvents] = useState<{
      [key: string]: boolean;
    }>({});
    const [isConnected, setIsConnected] = useState(false);
    const [canPushToTalk, setCanPushToTalk] = useState(true);
    const [isRecording, setIsRecording] = useState(false);
    const [memoryKv, setMemoryKv] = useState<{ [key: string]: any }>({});
    const [coords, setCoords] = useState<Coordinates | null>({
      lat: 41.0082,
      lng: 28.9784,
    });
    const [marker, setMarker] = useState<Coordinates | null>(null);
    const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
    const [isLocationPermissionGranted, setIsLocationPermissionGranted] = useState(false);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [isLoadingLocation, setIsLoadingLocation] = useState(false);
    const [watchId, setWatchId] = useState<number | null>(null);
    const [isResponding, setIsResponding] = useState(false);

    /**
     * Utility for formatting the timing of logs
     */
    const formatTime = useCallback((timestamp: string) => {
      const startTime = startTimeRef.current;
      const t0 = new Date(startTime).valueOf();
      const t1 = new Date(timestamp).valueOf();
      const delta = t1 - t0;
      const hs = Math.floor(delta / 10) % 100;
      const s = Math.floor(delta / 1000) % 60;
      const m = Math.floor(delta / 60_000) % 60;
      const pad = (n: number) => {
        let s = n + '';
        while (s.length < 2) {
          s = '0' + s;
        }
        return s;
      };
      return `${pad(m)}:${pad(s)}.${pad(hs)}`;
    }, []);

    /**
     * When you click the API key
     */
    const resetAPIKey = useCallback(() => {
      const newKey = prompt('OpenAI API Key');
      if (newKey) {
        localStorage.setItem('tmp::voice_api_key', newKey);
        window.location.reload();
      }
    }, []);

   

    const handleLocationError = useCallback((error: GeolocationPositionError) => {
      let errorMessage = "";
      switch (error.code) {
        case GeolocationPositionError.PERMISSION_DENIED:
          errorMessage = "Konum izni reddedildi. Taksi çağırmak için konum izni vermeniz gerekiyor.";
          setIsLocationPermissionGranted(false);

          break;
        case GeolocationPositionError.POSITION_UNAVAILABLE:
          errorMessage = "Konum servisi kullanılamıyor. Lütfen konum servisinin açık olduğundan emin olun.";
          // Konum servisinin kapalı olması izin durumunu etkilemez
          break;
        case GeolocationPositionError.TIMEOUT:
          errorMessage = "Konum bilgisi alınamadı. Lütfen tekrar deneyin.";
          // Zaman aşımı izin durumunu etkilemez, tekrar deneyebiliriz
          break;
      }
      setLocationError(errorMessage);
      setIsLoadingLocation(false);
    }, []);



    const getCurrentLocation = () => {
      return new Promise<{lat: number, lng: number}>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject("Tarayıcınız konum özelliğini desteklemiyor.");
          return;
        }

        console.log('Getting current location...');
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location = {
              lat: position.coords.latitude,
              lng: position.coords.longitude
            };
            console.log('Location received:', location);
            setUserLocation(location);
            setCoords(location);  // Her zaman coords'u güncelle
            //setIsLocationPermissionGranted(true);
            //setLocationError(null);
            resolve(location);
          },
          (error) => {
            console.error('Location error:', error);
            handleLocationError(error);
            reject(error);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      });
    };

    /**
     * Disconnect and reset conversation state
     */
    const disconnectConversation = useCallback(async () => {
      try {
        setIsResponding(false);
        setIsConnected(false);
        setRealtimeEvents([]);
        setItems([]);
        setMemoryKv({});
        setCoords({
          lat: 41.0082,
          lng: 28.9784,
        });
        setMarker(null);

        const client = clientRef.current;
        if (client.isConnected()) {
          client.disconnect();
        }

        const wavRecorder = wavRecorderRef.current;
        if (wavRecorder) {
          await wavRecorder.end();
        }

        const wavStreamPlayer = wavStreamPlayerRef.current;
        if (wavStreamPlayer) {
          await wavStreamPlayer.interrupt();
        }
      } catch (error) {
        console.error('Bağlantı kesme hatası:', error);
      }
    }, []);

    /**
     * Connect to conversation:
     * WavRecorder taks speech input, WavStreamPlayer output, client is API client
     */
    const connectConversation = useCallback(async () => {
      try {
        const client = clientRef.current;
        const wavRecorder = wavRecorderRef.current;
        const wavStreamPlayer = wavStreamPlayerRef.current;

        // Eğer zaten bağlıysa, önce bağlantıyı kes
        if (client.isConnected()) {
          await disconnectConversation();
          // Bağlantının tamamen kapanması için kısa bir bekleme
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        setIsLoadingLocation(true);
        await getCurrentLocation(); // İlk ve tek seferlik konum al
        
        startTimeRef.current = new Date().toISOString();
        setIsConnected(true);
        setRealtimeEvents([]);
        setItems(client.conversation.getItems());

        await wavRecorder.begin();
        await wavStreamPlayer.connect();
        await client.connect();

        if (client.getTurnDetectionType() === 'server_vad') {
          await wavRecorder.record((data) => client.appendInputAudio(data.mono));
        }
      } catch (error) {
        console.error('Bağlantı hatası:', error);
        setIsConnected(false);
        setIsLoadingLocation(false);
        // Hata durumunda temizlik yap
        await disconnectConversation();
      }
    }, [disconnectConversation, getCurrentLocation]);

    const deleteConversationItem = useCallback(async (id: string) => {
      const client = clientRef.current;
      client.deleteItem(id);
    }, []);

    /**
     * In push-to-talk mode, start recording
     * .appendInputAudio() for each sample
     */
    const startRecording = async () => {
      setIsRecording(true);
      const client = clientRef.current;
      const wavRecorder = wavRecorderRef.current;
      const wavStreamPlayer = wavStreamPlayerRef.current;
      const trackSampleOffset = await wavStreamPlayer.interrupt();
      if (trackSampleOffset?.trackId) {
        const { trackId, offset } = trackSampleOffset;
        await client.cancelResponse(trackId, offset);
      }
      await wavRecorder.record((data) => client.appendInputAudio(data.mono));
    };

    /**
     * In push-to-talk mode, stop recording
     */
    const stopRecording = async () => {
      setIsRecording(false);
      const client = clientRef.current;
      const wavRecorder = wavRecorderRef.current;
      await wavRecorder.pause();
      client.createResponse();
    };

    /**
     * Switch between Manual <> VAD mode for communication
     */
    const changeTurnEndType = async (value: string) => {
      const client = clientRef.current;
      const wavRecorder = wavRecorderRef.current;
      if (value === 'none' && wavRecorder.getStatus() === 'recording') {
        await wavRecorder.pause();
      }
      client.updateSession({
        turn_detection: value === 'none' ? null : { type: 'server_vad' },
      });
      if (value === 'server_vad' && client.isConnected()) {
        await wavRecorder.record((data) => client.appendInputAudio(data.mono));
      }
      setCanPushToTalk(value === 'none');
    };

    /**
     * Auto-scroll the event logs
     */
    useEffect(() => {
      if (eventsScrollRef.current) {
        const eventsEl = eventsScrollRef.current;
        const scrollHeight = eventsEl.scrollHeight;
        // Only scroll if height has just changed
        if (scrollHeight !== eventsScrollHeightRef.current) {
          eventsEl.scrollTop = scrollHeight;
          eventsScrollHeightRef.current = scrollHeight;
        }
      }
    }, [realtimeEvents]);

    /**
     * Auto-scroll the conversation logs
     */
    useEffect(() => {
      const conversationEls = [].slice.call(
        document.body.querySelectorAll('[data-conversation-content]')
      );
      for (const el of conversationEls) {
        const conversationEl = el as HTMLDivElement;
        conversationEl.scrollTop = conversationEl.scrollHeight;
      }
    }, [items]);

    /**
     * Set up render loops for the visualization canvas
     */
    useEffect(() => {
      let isLoaded = true;

      const wavRecorder = wavRecorderRef.current;
      const clientCanvas = clientCanvasRef.current;
      let clientCtx: CanvasRenderingContext2D | null = null;

      const wavStreamPlayer = wavStreamPlayerRef.current;
      const serverCanvas = serverCanvasRef.current;
      let serverCtx: CanvasRenderingContext2D | null = null;

      const render = () => {
        if (isLoaded) {
          if (clientCanvas) {
            if (!clientCanvas.width || !clientCanvas.height) {
              clientCanvas.width = clientCanvas.offsetWidth;
              clientCanvas.height = clientCanvas.offsetHeight;
            }
            clientCtx = clientCtx || clientCanvas.getContext('2d');
            if (clientCtx) {
              clientCtx.clearRect(0, 0, clientCanvas.width, clientCanvas.height);
              const result = wavRecorder.recording
                ? wavRecorder.getFrequencies('voice')
                : { values: new Float32Array([0]) };
              WavRenderer.drawBars(
                clientCanvas,
                clientCtx,
                result.values,
                '#0099ff',
                10,
                0,
                8
              );
            }
          }
          if (serverCanvas) {
            if (!serverCanvas.width || !serverCanvas.height) {
              serverCanvas.width = serverCanvas.offsetWidth;
              serverCanvas.height = serverCanvas.offsetHeight;
            }
            serverCtx = serverCtx || serverCanvas.getContext('2d');
            if (serverCtx) {
              serverCtx.clearRect(0, 0, serverCanvas.width, serverCanvas.height);
              const result = wavStreamPlayer.analyser
                ? wavStreamPlayer.getFrequencies('voice')
                : { values: new Float32Array([0]) };
              WavRenderer.drawBars(
                serverCanvas,
                serverCtx,
                result.values,
                '#009900',
                10,
                0,
                8
              );
            }
          }
          window.requestAnimationFrame(render);
        }
      };
      render();

      return () => {
        isLoaded = false;
      };
    }, []);

    /**
     * Core RealtimeClient and audio capture setup
     * Set all of our instructions, tools, events and more
     */
    useEffect(() => {
      const wavStreamPlayer = wavStreamPlayerRef.current;
      const client = clientRef.current;

      client.updateSession({
        instructions,
        input_audio_transcription: { model: 'whisper-1' },
        tools: [
          {
            name: 'find_nearest_taxi',
            description: 'En yakın taksiyi bulur',
            parameters: {
              type: 'object',
              properties: {
                lat: { type: 'number', default: coords?.lat },
                lng: { type: 'number', default: coords?.lng }
              },
              required: ['lat', 'lng']
            }
          }
        ]
      });

      // Add findNearestTaxi tool
      client.addTool(
        {
          name: 'find_nearest_taxi',
          description: 'Finds the nearest available taxi based on user location',
          parameters: {
            type: 'object',
            properties: {
              lat: {
                type: 'number',
                description: 'User latitude'
              },
              lng: {
                type: 'number',
                description: 'User longitude'
              }
            },
            required: ['lat', 'lng']
          }
        },
        async ({ lat, lng }: { lat: number, lng: number }) => {
          try {
            const taxi = await findNearestTaxi(lat, lng);
            if (!taxi) {
              return { 
                status: 'error',
                message: 'No available taxis found'
              };
            }

            // Mark taxi location on map
            setMarker({ lat: taxi.lat, lng: taxi.lng });
            
            // Mark taxi as busy
            await updateTaxiAvailability(taxi.id, false);

            const distanceInKm = (taxi.distance / 1000).toFixed(1);
            const estimatedMinutes = Math.ceil((taxi.distance / 1000) * (60 / 30));

            return {
              status: 'success',
              taxi: {
                driverName: taxi.driverName,
                plateNumber: taxi.plateNumber,
                distance: distanceInKm,
                estimatedMinutes: estimatedMinutes,
                location: {
                  lat: taxi.lat,
                  lng: taxi.lng
                }
              }
            };
          } catch (error) {
            console.error('Error in find_nearest_taxi:', error);
            return {
              status: 'error',
              message: 'Failed to find taxi'
            };
          }
        }
      );

      // handle realtime events from client + server for event logging
      client.on('realtime.event', (realtimeEvent: RealtimeEvent) => {
        setRealtimeEvents((realtimeEvents) => {
          const lastEvent = realtimeEvents[realtimeEvents.length - 1];
          if (lastEvent?.event.type === realtimeEvent.event.type) {
            // if we receive multiple events in a row, aggregate them for display purposes
            lastEvent.count = (lastEvent.count || 0) + 1;
            return realtimeEvents.slice(0, -1).concat(lastEvent);
          } else {
            return realtimeEvents.concat(realtimeEvent);
          }
        });
      });
      client.on('error', (event: any) => console.error(event));
      client.on('conversation.interrupted', async () => {
        const trackSampleOffset = await wavStreamPlayer.interrupt();
        if (trackSampleOffset?.trackId) {
          const { trackId, offset } = trackSampleOffset;
          await client.cancelResponse(trackId, offset);
        }
      });
      client.on('conversation.updated', async ({ item, delta }: any) => {
        // Sadece ses çıkışı varsa işle
        if (delta?.audio) {
          wavStreamPlayer.add16BitPCM(delta.audio, item.id);
        }
        
        // Ses dosyası tamamlandıysa kaydet
        if (item.status === 'completed' && item.formatted.audio?.length) {
            const wavFile = await WavRecorder.decode(
              item.formatted.audio,
              18000,
              18000
            );
            item.formatted.file = wavFile;
        }

        // Asistan mesajlarını işle
        if (item.role === 'assistant') {
          await handleServerMessage(item);
        }

        // Sadece son kullanıcı ve asistan mesajlarını tut
        const items = client.conversation.getItems().slice(-2);
        setItems(items);
      });

      setItems(client.conversation.getItems());

      return () => {
        // cleanup; resets to defaults
        client.reset();
      };
    }, [coords]);

    /**
     * Render the application
     */
    const handleAddSampleTaxis = async () => {
      await seedSampleTaxis();
      alert('Örnek taksiler eklendi!');
    };

    

    const handleServerMessage = useCallback(async (item: ItemType) => {
      if (item.type === 'message' && item.role === 'assistant') {
        // Eğer zaten yanıt veriyorsa, yeni yanıt oluşturmayı engelle
        if (isResponding) {
          console.log('Already responding, skipping new response');
          return;
        }

        let content = '';
        if (Array.isArray(item.content)) {
          content = item.content.map(c => c.type === 'text' ? c.text : '').join(' ');
        } else if (typeof item.content === 'string') {
          content = item.content;
        }

        // Taksi ile ilgili anahtar kelimeleri kontrol et
        const lowerContent = content.toLowerCase();
        const taxiKeywords = ['taksi', 'araba', 'araç', 'şoför', 'yönlendir', 'çağır'];
        const isTaxiRequest = taxiKeywords.some(keyword => lowerContent.includes(keyword));

        if (isTaxiRequest) {
          try {
            setIsResponding(true); // Yanıt vermeye başlıyoruz
            console.log('Taxi request detected');
            
            let location = userLocation;
            
            // Eğer konum yoksa, konum almayı dene
            if (!location) {
              console.log('No location, trying to get location...');
              try {
                location = await getCurrentLocation();
              } catch (error) {
                console.error('Failed to get location:', error);
                item.content = [{ 
                  type: 'text', 
                  text: " Size en yakın taksiyi bulmam için konumunuza ihtiyacım var." 
                }];
                setIsResponding(false); // Yanıt vermeyi bitiriyoruz
                return;
              }
            }

            console.log('Using location for taxi search:', location);
            
            if (!location?.lat || !location?.lng) {
              console.error('Location is missing or invalid:', location);
              item.content = [{ 
                type: 'text', 
                text: "Konum bilgisi eksik veya geçersiz." 
              }];
              setIsResponding(false); // Yanıt vermeyi bitiriyoruz
              return;
            }

            const nearestTaxi = await findNearestTaxi(location.lat, location.lng);
            console.log('findNearestTaxi result:', nearestTaxi);
          
            if (nearestTaxi && nearestTaxi.isAvailable) {
              await updateTaxiAvailability(nearestTaxi.id, false);
              const distanceInKm = (nearestTaxi.distance / 1000).toFixed(1);
              
              // Sadece marker'ı güncelle, coords'u değiştirme
              setMarker({ lat: nearestTaxi.lat, lng: nearestTaxi.lng });
              
              const estimatedMinutes = Math.ceil((nearestTaxi.distance / 1000) * (60 / 30));
               
              const response = `${nearestTaxi.driverName} adlı şoförümüz size yönlendirildi.\n\n` +
                             `🚖 Araç Plakası: ${nearestTaxi.plateNumber}\n` +
                             `📍 Mesafe: ${distanceInKm} km\n` +
                             `⏱️ Tahmini Varış: ${estimatedMinutes} dakika\n\n` +
                           `İyi yolculuklar! 🚕`;
                
              item.content = [{ type: 'text', text: response }];
            } else {
              item.content = [{ 
                type: 'text', 
                text: "Üzgünüm, şu anda yakınızda müsait taksi bulamadım." 
              }];
            }
          } catch (error) {
            console.error('Taksi arama hatası:', error);
            item.content = [{ 
              type: 'text', 
              text: "Taksi arama sırasında bir hata oluştu." 
            }];
          } finally {
            setIsResponding(false); // Her durumda yanıt vermeyi bitiriyoruz
          }
        }
      }
    }, [userLocation, getCurrentLocation, findNearestTaxi, updateTaxiAvailability, setMarker, isResponding]);
    
    

    // Konum durumunu gösteren bileşen
    const renderLocationStatus = () => {
      if (isLoadingLocation) {
        return (
          <div className="location-status loading">
            <MapPin className="icon" />
            Konum alınıyor...
          </div>
        );
      }

      if (locationError) {
        return (
          <div className="location-status error">
            <AlertCircle className="icon" />
            {locationError}
          </div>
        );
      }

      if (isLocationPermissionGranted && userLocation) {
        return (
          <div className="location-status success">
            <MapPin className="icon" />
            Konum aktif
          </div>
        );
      }

      return null;
    };

    return (
      <div data-component="ConsolePage">
        <div className="content-top">
          <div className="content-title">
            <img src="/openai-logomark.svg" />
            <span>realtime console</span>
          </div>
          <div className="content-api-key">
            {!LOCAL_RELAY_SERVER_URL && (
              <Button
                icon={Edit}
                iconPosition="end"
                buttonStyle="flush"
                label={`api key: ${apiKey.slice(0, 3)}...`}
                onClick={() => resetAPIKey()}
              />
            )}
          </div>
          {renderLocationStatus()}
        </div>
        <div className="content-main">
          <div className="content-logs">
            <div className="content-block events">
              <div className="visualization">
                <div className="visualization-entry client">
                  <canvas ref={clientCanvasRef} />
                </div>
                <div className="visualization-entry server">
                  <canvas ref={serverCanvasRef} />
                </div>
              </div>
              <div className="content-block-title">events</div>
              <div className="content-block-body" ref={eventsScrollRef}>
                {!realtimeEvents.length && `awaiting connection...`}
                {realtimeEvents.map((realtimeEvent, i) => {
                  const count = realtimeEvent.count;
                  const event = { ...realtimeEvent.event };
                  if (event.type === 'input_audio_buffer.append') {
                    event.audio = `[trimmed: ${event.audio.length} bytes]`;
                  } else if (event.type === 'response.audio.delta') {
                    event.delta = `[trimmed: ${event.delta.length} bytes]`;
                  }
                  return (
                    <div className="event" key={event.event_id}>
                      <div className="event-timestamp">
                        {formatTime(realtimeEvent.time)}
                      </div>
                      <div className="event-details">
                        <div
                          className="event-summary"
                          onClick={() => {
                            // toggle event details
                            const id = event.event_id;
                            const expanded = { ...expandedEvents };
                            if (expanded[id]) {
                              delete expanded[id];
                            } else {
                              expanded[id] = true;
                            }
                            setExpandedEvents(expanded);
                          }}
                        >
                          <div
                            className={`event-source ${
                              event.type === 'error'
                                ? 'error'
                                : realtimeEvent.source
                            }`}
                          >
                            {realtimeEvent.source === 'client' ? (
                              <ArrowUp />
                            ) : (
                              <ArrowDown />
                            )}
                            <span>
                              {event.type === 'error'
                                ? 'error!'
                                : realtimeEvent.source}
                            </span>
                          </div>
                          <div className="event-type">
                            {event.type}
                            {count && ` (${count})`}
                          </div>
                        </div>
                        {!!expandedEvents[event.event_id] && (
                          <div className="event-payload">
                            {JSON.stringify(event, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="content-block conversation">
              <div className="content-block-title">conversation</div>
              <div className="content-block-body" data-conversation-content>
                {!items.length && `awaiting connection...`}
                {items.map((conversationItem, i) => {
                  return (
                    <div className="conversation-item" key={conversationItem.id}>
                      <div className={`speaker ${conversationItem.role || ''}`}>
                        <div>
                          {(
                            conversationItem.role || conversationItem.type
                          ).replaceAll('_', ' ')}
                        </div>
                        <div
                          className="close"
                          onClick={() =>
                            deleteConversationItem(conversationItem.id)
                          }
                        >
                          <X />
                        </div>
                      </div>
                      <div className={`speaker-content`}>
                        {/* tool response */}
                        {conversationItem.type === 'function_call_output' && (
                          <div>{conversationItem.formatted.output}</div>
                        )}
                        {/* tool call */}
                        {!!conversationItem.formatted.tool && (
                          <div>
                            {conversationItem.formatted.tool.name}(
                            {conversationItem.formatted.tool.arguments})
                          </div>
                        )}
                        {!conversationItem.formatted.tool &&
                          conversationItem.role === 'user' && (
                            <div>
                              {conversationItem.formatted.transcript ||
                                (conversationItem.formatted.audio?.length
                                  ? '(awaiting transcript)'
                                  : conversationItem.formatted.text ||
                                    '(item sent)')}
                            </div>
                          )}
                        {!conversationItem.formatted.tool &&
                          conversationItem.role === 'assistant' && (
                            <div>
                              {conversationItem.formatted.transcript ||
                                conversationItem.formatted.text ||
                                '(truncated)'}
                            </div>
                          )}
                        {conversationItem.formatted.file && (
                          <audio
                            src={conversationItem.formatted.file.url}
                            controls
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="content-actions">
              <Toggle
                defaultValue={false}
                values={['none', 'server_vad']}
                onChange={(_, value) => changeTurnEndType(value)}
              />
              <div className="spacer" />
              {isConnected && canPushToTalk && (
                <Button
                  label={isRecording ? 'release to send' : 'push to talk'}
                  buttonStyle={isRecording ? 'alert' : 'regular'}
                  disabled={!isConnected || !canPushToTalk}
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                />
              )}
              <div className="spacer" />
              <Button
                label={isConnected ? 'disconnect' : 'connect'}
                iconPosition={isConnected ? 'end' : 'start'}
                icon={isConnected ? X : Zap}
                buttonStyle={isConnected ? 'regular' : 'action'}
                onClick={
                  isConnected ? disconnectConversation : connectConversation
                }
              />
              <Button
                label="Örnek Taksileri Ekle"
                onClick={handleAddSampleTaxis}
              />
              <div className="spacer" />
            </div>
          </div>
          
          <div className="content-right">
            <div className="content-block map">
              
           
              <div className="content-block-body full">
                {coords && (
                  <Map
                    center={[coords.lat, coords.lng]}
                    location={coords.location}
                  />
                )}
              </div>
            </div>
           
          </div>
        </div>
      </div>
    );
  }
