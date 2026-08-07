import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Circle,
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const PARANA_CENTER = [-24.7, -51.8];

function isCoordinate(value) {
  return Number.isFinite(Number(value));
}

function pointPosition(point) {
  if (!isCoordinate(point?.latitude) || !isCoordinate(point?.longitude)) return null;
  return [Number(point.latitude), Number(point.longitude)];
}

function MapViewport({ positions, resetToken = 0 }) {
  const map = useMap();
  useEffect(() => {
    if (!positions.length) return;
    if (positions.length === 1) map.setView(positions[0], 13, { animate: true });
    else map.fitBounds(positions, { padding: [44, 44], animate: true, maxZoom: 13 });
  }, [map, positions, resetToken]);
  return null;
}

function MapClickHandler({ enabled, onClick }) {
  useMapEvents({
    click(event) {
      if (enabled) onClick?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    }
  });
  return null;
}

function normalizeRisk(level) {
  return String(level || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function riskColor(level) {
  const normalized = normalizeRisk(level);
  if (normalized.includes('critico')) return '#b91c1c';
  if (normalized.includes('alto')) return '#ef4444';
  if (normalized.includes('moderado') || normalized.includes('atencao')) return '#f59e0b';
  return '#2563eb';
}

function formatDistance(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} km` : 'Em cálculo';
}

function formatDuration(value) {
  if (!Number.isFinite(Number(value))) return 'Em cálculo';
  const total = Math.round(Number(value));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours ? `${hours}h ${minutes}min` : `${minutes} min`;
}

export function RotogramaOverviewMap({ routes = [], supportZones = [], onSelectRoute }) {
  const positions = useMemo(() => [...routes.map((route) => route.center).filter(Boolean), ...supportZones.map((zone) => [zone.latitude, zone.longitude])], [routes, supportZones]);
  const [resetToken, setResetToken] = useState(0);
  return (
    <section className="rotograma-overview-shell" aria-label="Mapa geral das rotas">
      <div className="rotograma-overview-heading">
        <div>
          <span>Mapa operacional</span>
          <h2>Rotas do Paraná</h2>
          <p>Selecione uma cidade no mapa para abrir seu rotograma.</p>
        </div>
        <button type="button" onClick={() => setResetToken((value) => value + 1)}>Ver todas as rotas</button>
      </div>
      <div className="rotograma-overview-map">
        <MapContainer center={PARANA_CENTER} zoom={7} scrollWheelZoom className="rotograma-leaflet-map">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapViewport positions={positions} resetToken={resetToken} />
          {supportZones.map((zone) => (
            <Circle key={`overview-support-${zone.id}`} center={[zone.latitude, zone.longitude]} radius={zone.radiusKm * 1000} pathOptions={{ color: '#15803d', fillColor: '#22c55e', fillOpacity: 0.13, weight: 2 }}>
              <Popup><div className="rotograma-map-popup support-popup"><strong>{zone.nome || 'Região com suporte em rota'}</strong><p>Suporte operacional disponível nesta região para atolamentos e situações semelhantes.</p><small>Cobertura de até {zone.radiusKm} km.</small></div></Popup>
            </Circle>
          ))}
          {routes.map((route) => (
            <CircleMarker
              key={route.id}
              center={route.center}
              radius={route.classificacao_rota === 'OK' ? 7 : 9}
              eventHandlers={{ click: () => onSelectRoute?.(route.id) }}
              pathOptions={{ color: '#fff', fillColor: route.classificacao_rota === 'OK' ? '#2563eb' : '#f97316', fillOpacity: 0.92, weight: 2 }}
            >
              <Tooltip direction="top">{route.nome}</Tooltip>
              <Popup>
                <div className="rotograma-map-popup">
                  <strong>{route.nome}</strong>
                  <p>{route.origem || 'Origem não informada'} → {route.destino || route.cidade}</p>
                  <button type="button" onClick={() => onSelectRoute?.(route.id)}>Abrir rotograma</button>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
      <div className="rotograma-overview-footer"><span><i className="ok" /> Rota OK</span><span><i className="attention" /> Rota em atenção</span><span><i className="support" /> Suporte até 80 km</span><b>{routes.length} rotas · {supportZones.length} regiões de suporte</b></div>
    </section>
  );
}

export default function RotogramaMap({
  routePath = [],
  points = [],
  supportZones = [],
  mapMetrics = {},
  selectedPointId,
  onSelectPoint,
  onRouteCalculated,
  editorMode,
  draftCoordinates = [],
  onMapClick
}) {
  const [calculatedRoutePath, setCalculatedRoutePath] = useState(routePath);
  const [routeStatus, setRouteStatus] = useState(routePath.length ? 'ready' : 'idle');
  const [showPoints, setShowPoints] = useState(true);
  const [showSupport, setShowSupport] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [calculatedMetrics, setCalculatedMetrics] = useState(mapMetrics);
  const routeCalculatedRef = useRef(onRouteCalculated);
  routeCalculatedRef.current = onRouteCalculated;
  const validPoints = useMemo(() => points.map((point) => ({ point, position: pointPosition(point) })).filter((item) => item.position), [points]);

  useEffect(() => {
    if (routePath.length) {
      setCalculatedRoutePath(routePath);
      setCalculatedMetrics(mapMetrics);
      setRouteStatus('ready');
      return undefined;
    }
    if (validPoints.length < 2) {
      setCalculatedRoutePath(validPoints.map((item) => item.position));
      return undefined;
    }
    const controller = new AbortController();
    const coordinates = validPoints.map(({ position }) => `${position[1]},${position[0]}`).join(';');
    setRouteStatus('loading');
    fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Falha ao calcular rota');
        return response.json();
      })
      .then((result) => {
        const resultRoute = result?.routes?.[0];
        const coordinatesResult = resultRoute?.geometry?.coordinates || [];
        if (!coordinatesResult.length) throw new Error('Rota sem geometria');
        const path = coordinatesResult.map(([longitude, latitude]) => [latitude, longitude]);
        const metrics = { distanceKm: resultRoute.distance / 1000, durationMinutes: resultRoute.duration / 60 };
        setCalculatedRoutePath(path);
        setCalculatedMetrics(metrics);
        setRouteStatus('ready');
        routeCalculatedRef.current?.({ path, ...metrics });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setCalculatedRoutePath(validPoints.map((item) => item.position));
        setRouteStatus('fallback');
      });
    return () => controller.abort();
  }, [mapMetrics, routePath, validPoints]);

  const viewportPositions = useMemo(() => calculatedRoutePath.length ? calculatedRoutePath : [
    ...validPoints.map((item) => item.position),
    ...supportZones.map((zone) => [zone.latitude, zone.longitude])
  ], [calculatedRoutePath, supportZones, validPoints]);

  return (
    <div className={`rotograma-map-shell ${fullscreen ? 'fullscreen' : ''}`}>
      <div className="rotograma-map-toolbar">
        <div>
          <span className="rotograma-map-eyebrow">Visão informativa</span>
          <strong>Trajeto, pontos de atenção e regiões com suporte</strong>
          {routeStatus === 'loading' ? <small>Calculando o trajeto pelas rodovias...</small> : null}
          {routeStatus === 'fallback' ? <small>Prévia simplificada entre os pontos cadastrados.</small> : null}
        </div>
        <div className="rotograma-map-actions">
          <button type="button" className={showPoints ? 'active' : ''} onClick={() => setShowPoints((value) => !value)}>Pontos</button>
          <button type="button" className={showSupport ? 'active support' : ''} onClick={() => setShowSupport((value) => !value)}>Suporte</button>
          <button type="button" onClick={() => setResetToken((value) => value + 1)}>Centralizar</button>
          <button type="button" onClick={() => setFullscreen((value) => !value)}>{fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}</button>
        </div>
      </div>
      <div className="rotograma-map-metrics">
        <span><b>{formatDistance(calculatedMetrics?.distanceKm)}</b> distância estimada</span>
        <span><b>{formatDuration(calculatedMetrics?.durationMinutes)}</b> tempo estimado</span>
        <span><b>{points.length}</b> pontos cadastrados</span>
        <span><b>{supportZones.length}{supportZones.some((zone) => zone.simulated) ? ' simulações' : ''}</b> regiões com suporte</span>
      </div>
      {editorMode ? <div className="rotograma-map-editor-hint">Modo de edição: {editorMode}. Clique no mapa para posicionar.</div> : null}
      <div className="rotograma-map-canvas">
        <MapContainer center={PARANA_CENTER} zoom={7} scrollWheelZoom className="rotograma-leaflet-map">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapViewport positions={viewportPositions} resetToken={resetToken} />
          <MapClickHandler enabled={Boolean(editorMode)} onClick={onMapClick} />
          {showSupport && supportZones.map((zone) => (
            <Circle key={zone.id} center={[zone.latitude, zone.longitude]} radius={zone.radiusKm * 1000} pathOptions={{ color: '#15803d', fillColor: '#22c55e', fillOpacity: 0.16, weight: 2 }}>
              <Popup><div className="rotograma-map-popup support-popup"><strong>{zone.simulated ? 'Demonstração de cobertura' : 'Região com suporte em rota'}</strong><p>{zone.simulated ? 'Exemplo visual. Esta área ainda não representa um suporte oficial cadastrado.' : 'Há suporte operacional nesta região para atolamentos e situações semelhantes.'}</p><small>Cobertura aproximada de {zone.radiusKm} km.</small></div></Popup>
            </Circle>
          ))}
          {calculatedRoutePath.length ? <><Polyline positions={calculatedRoutePath} pathOptions={{ color: '#fff', opacity: 0.92, weight: 10 }} /><Polyline positions={calculatedRoutePath} pathOptions={{ color: '#2563eb', opacity: 0.96, weight: 5 }} /></> : null}
          {showPoints && points.map((point) => point.segment?.length ? (
            <Polyline key={`segment-${point.id}`} positions={point.segment} eventHandlers={{ click: () => onSelectPoint?.(point.id) }} pathOptions={{ color: riskColor(point.trecho_nivel || point.nivel_risco), opacity: selectedPointId === point.id ? 1 : 0.9, weight: selectedPointId === point.id ? 11 : 8 }} />
          ) : null)}
          {calculatedRoutePath.length ? <><CircleMarker center={calculatedRoutePath[0]} radius={9} pathOptions={{ color: '#fff', fillColor: '#16a34a', fillOpacity: 1, weight: 3 }}><Tooltip direction="top">Início da rota</Tooltip></CircleMarker><CircleMarker center={calculatedRoutePath[calculatedRoutePath.length - 1]} radius={9} pathOptions={{ color: '#fff', fillColor: '#111827', fillOpacity: 1, weight: 3 }}><Tooltip direction="top">Fim da rota</Tooltip></CircleMarker></> : null}
          {showPoints && validPoints.map(({ point, position }, index) => (
            <CircleMarker key={point.id} center={position} radius={selectedPointId === point.id ? 11 : 8} eventHandlers={{ click: () => onSelectPoint?.(point.id) }} pathOptions={{ color: '#fff', fillColor: riskColor(point.nivel_risco), fillOpacity: 1, weight: 3 }}>
              <Tooltip permanent direction="center" className="rotograma-point-number">{index + 1}</Tooltip>
              <Popup><div className="rotograma-map-popup"><strong>{point.descricao || point.tipo_ponto || 'Ponto de atenção'}</strong><p>{point.orientacao || 'Consulte a orientação operacional deste ponto.'}</p>{point.velocidade_segura ? <small>Velocidade segura: {point.velocidade_segura}</small> : null}</div></Popup>
            </CircleMarker>
          ))}
          {draftCoordinates.map((position, index) => <CircleMarker key={`draft-${index}`} center={[position.latitude, position.longitude]} radius={10} pathOptions={{ color: '#fff', fillColor: '#7c3aed', fillOpacity: 1, weight: 3 }}><Tooltip permanent>{index === 0 ? 'Início' : 'Fim'}</Tooltip></CircleMarker>)}
        </MapContainer>
      </div>
      <div className="rotograma-map-footer"><div className="rotograma-map-legend"><span><i className="route" /> Rota</span><span><i className="attention" /> Atenção</span><span><i className="support" /> Região com suporte</span></div><p>Mapa informativo. Siga a sinalização da via e as orientações oficiais da operação.</p></div>
    </div>
  );
}
