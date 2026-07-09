export default function Footer() {
  return (
    <footer className="bg-ink-900 text-ink-300 border-t border-ink-700 mt-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Sección de créditos */}
          <div>
            <h3 className="text-white font-semibold mb-4 uppercase tracking-wide text-sm">Plataforma Comfenalco Tolima</h3>
            <p className="text-sm text-ink-400">
              Gestión de servicios de recreación y bienestar para nuestros afiliados.
            </p>
          </div>

          {/* Sección de contacto */}
          <div>
            <h3 className="text-white font-semibold mb-4 uppercase tracking-wide text-sm">Contacto del Desarrollador</h3>
            <div className="text-sm space-y-2">
              <p>
                <span className="text-ink-400">Desarrollado por: </span>
                <span className="text-white">Juan Daniel Velasquez Rojas</span>
              </p>
              <p>
                <span className="text-ink-400">Email: </span>
                <a
                  href="mailto:jd_drums1521@hotmail.com"
                  className="text-accent-400 hover:text-white transition-colors"
                >
                  jd_drums1521@hotmail.com
                </a>
              </p>
              <p>
                <span className="text-ink-400">Teléfono: </span>
                <a
                  href="tel:+573057044151"
                  className="text-accent-400 hover:text-white transition-colors"
                >
                  +57 305 704 4151
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Línea divisoria */}
        <div className="border-t border-ink-700 my-6"></div>

        {/* Copyright */}
        <div className="text-center text-sm text-ink-500">
          <p>© {new Date().getFullYear()} Comfenalco Tolima - Servicios de Recreación. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  )
}
