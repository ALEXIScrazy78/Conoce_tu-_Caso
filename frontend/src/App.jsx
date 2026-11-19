import React, { useEffect, useRef, useState } from "react";
import "./App.css";

const CACHE_STORAGE_KEY = "entiende_tu_caso_cache_v1";
const PREFS_STORAGE_KEY = "entiende_tu_caso_prefs_v1";
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
  /\/+$/,
  ""
);

const RESOLUCIONES_INICIALES = [
  {
    id: "res-19",
    titulo: "Resolución N.° 19 · Sentencia de Vista",
    resumenCorto: "Revisa la condena de primera instancia y resuelve la apelación",
    destacada: true,
  },
  {
    id: "res-13",
    titulo: "Resolución N.° 13 · Sentencia de Primera Instancia",
    resumenCorto: "Fallo inicial del juzgado unipersonal",
    destacada: false,
  },
];

export default function App() {
  const [cacheAnalisis, setCacheAnalisis] = useState(() => {
    try {
      const saved = sessionStorage.getItem(CACHE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [prefs, setPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem(PREFS_STORAGE_KEY);
      return saved
        ? JSON.parse(saved)
        : { fontSize: 16, theme: "light" }; // "light" | "dark" | "high-contrast" | "colorblind"
    } catch {
      return { fontSize: 16, theme: "light" };
    }
  });

  const [resolucionActiva, setResolucionActiva] = useState(null);
  const [vistaActiva, setVistaActiva] = useState("lista");
  const [archivoManual, setArchivoManual] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [error, setError] = useState(null);
  const [leyendo, setLeyendo] = useState(false);

  const soportaVoz =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const leyendoRef = useRef(false);

  const detenerLectura = () => {
    leyendoRef.current = false;
    setLeyendo(false);
    if (soportaVoz) {
      window.speechSynthesis.cancel();
    }
  };

  useEffect(() => {
    try {
      sessionStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cacheAnalisis));
    } catch {
      // Ignorar errores de almacenamiento
    }
  }, [cacheAnalisis]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignorar errores de almacenamiento
    }
  }, [prefs]);

  useEffect(() => {
    if (!soportaVoz) return;
    window.speechSynthesis.getVoices();
    const handleVoicesChanged = () => {
      window.speechSynthesis.getVoices();
    };
    window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged);
      window.speechSynthesis.cancel();
    };
  }, [soportaVoz]);

  const cambiarTamanoLetra = (delta) => {
    setPrefs((prev) => ({
      ...prev,
      fontSize: Math.max(14, Math.min(22, prev.fontSize + delta)),
    }));
  };

  const cambiarTema = (theme) => {
    setPrefs((prev) => ({ ...prev, theme }));
  };

  const construirTextoParaLeer = (datos, tituloResolucion) => {
    if (!datos) return "";
    const partes = [
      tituloResolucion ? `${tituloResolucion}.` : "",
      datos.traduccion_ciudadana
        ? `Explicación directa para usted: ${datos.traduccion_ciudadana}`
        : "",
      datos.resolucion_fallo
        ? `Decisión final y qué debe hacer usted: ${datos.resolucion_fallo}`
        : "",
      datos.resumen_antecedentes
        ? `Antecedentes y pruebas revisadas: ${datos.resumen_antecedentes}`
        : "",
    ];

    if (Array.isArray(datos.fundamentos_clave) && datos.fundamentos_clave.length > 0) {
      partes.push(`Puntos clave del análisis: ${datos.fundamentos_clave.join(". ")}`);
    }

    return partes.filter(Boolean).join("\n\n");
  };

  const elegirMejorVozEspanol = () => {
    const voces = window.speechSynthesis.getVoices() || [];
    const esVoces = voces.filter(
      (v) => v.lang && v.lang.toLowerCase().startsWith("es")
    );

    if (esVoces.length === 0) return null;

    const naturalPe = esVoces.find(
      (v) =>
        v.lang.toLowerCase().startsWith("es-pe") &&
        /natural|neural|online/i.test(v.name)
    );
    if (naturalPe) return naturalPe;

    const naturalEs = esVoces.find((v) =>
      /natural|neural|online/i.test(v.name)
    );
    if (naturalEs) return naturalEs;

    const googleEs = esVoces.find((v) => /google/i.test(v.name));
    if (googleEs) return googleEs;

    const peEs = esVoces.find((v) => v.lang.toLowerCase().startsWith("es-pe"));
    return peEs || esVoces[0];
  };

  const alternarLectura = (datos, tituloResolucion) => {
    if (!soportaVoz) {
      setError("Su navegador no admite lectura de voz automática.");
      return;
    }

    if (leyendo) {
      detenerLectura();
      return;
    }

    const texto = construirTextoParaLeer(datos, tituloResolucion).trim();
    if (!texto) return;

    window.speechSynthesis.cancel();

    const trozos = texto
      .split(/\n+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (trozos.length === 0) return;

    const vozElegida = elegirMejorVozEspanol();

    leyendoRef.current = true;
    setLeyendo(true);

    trozos.forEach((fragmento, indice) => {
      const utterance = new SpeechSynthesisUtterance(fragmento);
      utterance.lang = vozElegida?.lang || "es-PE";
      if (vozElegida) {
        utterance.voice = vozElegida;
      }
      utterance.rate = 0.95;
      utterance.pitch = 1.02;

      if (indice === trozos.length - 1) {
        utterance.onend = () => {
          leyendoRef.current = false;
          setLeyendo(false);
        };
      }

      utterance.onerror = () => {
        if (!leyendoRef.current) return;
        if (indice === trozos.length - 1) {
          leyendoRef.current = false;
          setLeyendo(false);
        }
      };

      window.speechSynthesis.speak(utterance);
    });
  };

  const analizarResolucion = async (resolucion, archivoPdf, forzar = false) => {
    detenerLectura();
    setError(null);

    if (!forzar && cacheAnalisis[resolucion.id]) {
      setResolucionActiva(resolucion);
      setVistaActiva("ficha");
      return;
    }

    if (!archivoPdf) {
      setResolucionActiva(resolucion);
      setVistaActiva("ficha");
      setError("Selecciona primero un archivo PDF arriba para analizar esta resolución.");
      return;
    }

    setResolucionActiva(resolucion);
    setVistaActiva("ficha");
    setLoadingId(resolucion.id);

    const formData = new FormData();
    formData.append("file", archivoPdf);

    try {
      const response = await fetch(`${API_URL}/process-pdf`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Ocurrió un error en el servidor al procesar el PDF.");
      }

      const data = await response.json();

      setCacheAnalisis((prev) => ({
        ...prev,
        [resolucion.id]: {
          ...data,
          _guardadoEn: new Date().toLocaleTimeString(),
          _archivo: archivoPdf.name,
        },
      }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingId(null);
    }
  };

  const limpiarCache = () => {
    detenerLectura();
    setCacheAnalisis({});
    sessionStorage.removeItem(CACHE_STORAGE_KEY);
  };

  const irALista = () => {
    detenerLectura();
    setVistaActiva("lista");
    setError(null);
  };

  const datosActuales = resolucionActiva ? cacheAnalisis[resolucionActiva.id] : null;
  const estaCargando = resolucionActiva && loadingId === resolucionActiva.id;

  return (
    <div
      className={`app-page theme--${prefs.theme}`}
      style={{ fontSize: `${prefs.fontSize}px` }}
    >
      <div className="app-ribbon">
        Prototipo <strong>Entiende tu Caso</strong> · Explicación en lenguaje claro para personas
      </div>

      <header className="app-header">
        <div className="app-container app-header-inner">
          <div>
            <h1 className="app-header-title">Consulta de Expedientes Judiciales</h1>
            <p className="app-header-sub">
              Lectura sencilla y accesible de resoluciones judiciales
            </p>
          </div>

          <div className="app-a11y-bar" aria-label="Opciones de lectura y accesibilidad">
            <div className="app-a11y-group">
              <span className="app-a11y-label">Letra:</span>
              <button
                type="button"
                onClick={() => cambiarTamanoLetra(-2)}
                className="app-a11y-btn"
                title="Reducir tamaño de letra"
              >
                A-
              </button>
              <span className="app-a11y-size">{prefs.fontSize}px</span>
              <button
                type="button"
                onClick={() => cambiarTamanoLetra(2)}
                className="app-a11y-btn"
                title="Aumentar tamaño de letra"
              >
                A+
              </button>
            </div>

            <div className="app-a11y-group">
              <button
                type="button"
                onClick={() => cambiarTema("light")}
                className={`app-a11y-btn ${prefs.theme === "light" ? "is-active" : ""}`}
              >
                Claro
              </button>
              <button
                type="button"
                onClick={() => cambiarTema("dark")}
                className={`app-a11y-btn ${prefs.theme === "dark" ? "is-active" : ""}`}
              >
                Oscuro
              </button>
              <button
                type="button"
                onClick={() => cambiarTema("high-contrast")}
                className={`app-a11y-btn ${prefs.theme === "high-contrast" ? "is-active" : ""}`}
              >
                Alto contraste
              </button>
              <button
                type="button"
                onClick={() => cambiarTema("colorblind")}
                className={`app-a11y-btn ${prefs.theme === "colorblind" ? "is-active" : ""}`}
                title="Paleta de colores adaptada para daltonismo"
              >
                Daltonismo
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="app-nav">
        <div className="app-container app-nav-inner">
          <div className="app-nav-links">
            <span className="app-nav-link" onClick={irALista}>
              EXPEDIENTE
            </span>
          </div>

          <div className="app-nav-status">
            <span>Analizadas en sesión: {Object.keys(cacheAnalisis).length}</span>
            {Object.keys(cacheAnalisis).length > 0 && (
              <button type="button" onClick={limpiarCache} className="app-btn-clear">
                Limpiar caché
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="app-main">
        <div className="app-container">
          {vistaActiva === "lista" && (
            <>
              <h2 className="app-section-title">Detalle del Expediente</h2>

              <div className="app-datos-grid">
                <div>
                  <span className="app-label-muted">Expediente</span>
                  <strong>03120-2022-23-1501-JR-PE-02</strong>
                </div>
                <div>
                  <span className="app-label-muted">Especialidad</span>
                  <strong>Penal (Apelación)</strong>
                </div>
                <div>
                  <span className="app-label-muted">Órgano Jurisdiccional</span>
                  <strong>2.ª Sala Penal de Apelaciones</strong>
                </div>
                <div>
                  <span className="app-label-muted">Estado</span>
                  <strong>Sentencia de Vista emitida</strong>
                </div>
              </div>

              <div className="app-upload-bar">
                <div className="app-upload-controls">
                  <strong className="app-upload-label">PDF para primer análisis:</strong>
                  <label className="app-file-btn">
                    Seleccionar PDF
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={(e) => setArchivoManual(e.target.files?.[0] || null)}
                      style={{ display: "none" }}
                    />
                  </label>
                  <span className="app-file-name">
                    {archivoManual
                      ? `📄 ${archivoManual.name}`
                      : "Ningún archivo seleccionado"}
                  </span>
                </div>
              </div>

              <div className="app-res-list">
                {RESOLUCIONES_INICIALES.map((res) => {
                  const yaAnalizada = Boolean(cacheAnalisis[res.id]);
                  const cargandoEsta = loadingId === res.id;

                  return (
                    <div
                      key={res.id}
                      className={`app-res-card ${res.destacada ? "app-res-card--selected" : ""}`}
                    >
                      <div className="app-res-info">
                        <div className="app-res-header">
                          <strong className="app-res-title">{res.titulo}</strong>
                          {yaAnalizada && (
                            <span className="app-badge-cache">★ Guardada en caché</span>
                          )}
                        </div>
                        <p className="app-res-desc">{res.resumenCorto}</p>
                      </div>

                      <div className="app-res-actions">
                        <button
                          type="button"
                          disabled={cargandoEsta}
                          onClick={() => analizarResolucion(res, archivoManual, false)}
                          className={`app-btn ${
                            res.destacada || yaAnalizada ? "app-btn--primary" : ""
                          }`}
                        >
                          {cargandoEsta
                            ? "Analizando con IA..."
                            : yaAnalizada
                            ? "Ver análisis guardado"
                            : "Entiende tu resolución"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {vistaActiva === "ficha" && resolucionActiva && (
            <div>
              <div className="app-ficha-header">
                <button type="button" onClick={irALista} className="app-back-btn">
                  ← Volver al expediente
                </button>

                {datosActuales && (
                  <div className="app-ficha-toolbar">
                    <button
                      type="button"
                      onClick={() =>
                        alternarLectura(datosActuales, resolucionActiva.titulo)
                      }
                      className={`app-btn-voice ${leyendo ? "is-speaking" : ""}`}
                    >
                      {leyendo ? "⏹ Detener voz" : "🔊 Escuchar explicación"}
                    </button>
                  </div>
                )}
              </div>

              <h2 className="app-section-title">{resolucionActiva.titulo}</h2>

              {estaCargando && (
                <div className="app-loading-box">
                  ⏳ Analizando el PDF con inteligencia artificial... La primera vez toma unos
                  segundos; luego quedará guardado temporalmente.
                </div>
              )}

              {error && (
                <div className="app-error-box">
                  <strong>Aviso:</strong> {error}
                </div>
              )}

              {!estaCargando && datosActuales && (
                <div className="app-ficha-stack">
                  <div className="app-bubble">
                    <strong className="app-bubble-title">
                      Explicación directa para usted:
                    </strong>
                    <p className="app-bubble-text">{datosActuales.traduccion_ciudadana}</p>
                  </div>

                  <div className="app-sec-box">
                    <h3 className="app-sec-title">Decisión final y qué debe hacer usted</h3>
                    <p className="app-fallo-text">{datosActuales.resolucion_fallo}</p>
                  </div>

                  <div className="app-sec-box">
                    <h3 className="app-sec-title">Antecedentes y pruebas revisadas</h3>
                    <p className="app-body-text">{datosActuales.resumen_antecedentes}</p>
                  </div>

                  <div className="app-sec-box">
                    <h3 className="app-sec-title">Puntos clave del análisis</h3>
                    <ul className="app-list">
                      {(datosActuales.fundamentos_clave || []).map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="app-meta-footer">
                    Expediente: <strong>{datosActuales.expediente}</strong> · Juzgado:{" "}
                    <strong>{datosActuales.juzgado}</strong>
                    {datosActuales._guardadoEn &&
                      ` · En caché desde las ${datosActuales._guardadoEn}`}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}