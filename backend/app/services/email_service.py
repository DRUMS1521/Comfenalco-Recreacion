import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import List, Optional, Tuple

from app.core.config import settings


_PLACEHOLDERS = ("tu_email", "tu_app_password", "tu_correo", "example.com", "cambiar")


def _hay_smtp() -> bool:
    """True solo si hay credenciales SMTP reales.

    El `.env` de ejemplo trae valores como `tu_email@gmail.com`: sin esta
    comprobación pasarían como "configurado" y el envío fallaría con un error de
    autenticación confuso en vez de avisar de que falta configurarlo.
    """
    usuario = (settings.SMTP_USER or "").strip().lower()
    clave = (settings.SMTP_PASSWORD or "").strip().lower()
    if not usuario or not clave:
        return False
    return not any(p in usuario or p in clave for p in _PLACEHOLDERS)


def enviar_correo(
    destinatario: str,
    asunto: str,
    html: str,
    adjuntos: Optional[List[Tuple[str, bytes, str]]] = None,
    copia: Optional[str] = None,
) -> bool:
    """Envía un correo HTML, opcionalmente con adjuntos.

    `adjuntos` es una lista de (nombre_archivo, contenido_bytes, mime). Devuelve
    False (sin lanzar) si no hay credenciales SMTP configuradas, para que la
    cotización no se pierda por un problema de correo.
    """
    if not _hay_smtp():
        print("[EMAIL] Credenciales SMTP no configuradas, omitiendo envío.")
        return False

    msg = MIMEMultipart("mixed")
    msg["Subject"] = asunto
    msg["From"] = settings.EMAIL_FROM or settings.SMTP_USER
    msg["To"] = destinatario
    if copia:
        msg["Cc"] = copia

    alternativo = MIMEMultipart("alternative")
    alternativo.attach(MIMEText(html, "html"))
    msg.attach(alternativo)

    for nombre, contenido, mime in adjuntos or []:
        principal, _, sub = mime.partition("/")
        parte = MIMEApplication(contenido, _subtype=sub or "octet-stream")
        parte.add_header("Content-Disposition", "attachment", filename=nombre)
        msg.attach(parte)

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.sendmail(msg["From"], [destinatario] + ([copia] if copia else []), msg.as_string())

    print(f"[EMAIL] Enviado a {destinatario}: {asunto}")
    return True


def _money(valor) -> str:
    """Formato de moneda colombiano: $ 1.800.000"""
    try:
        return "$ " + f"{float(valor or 0):,.0f}".replace(",", ".")
    except (TypeError, ValueError):
        return "$ 0"


def plantilla_cotizacion(cotizacion, mensaje: str = "") -> str:
    """Cuerpo HTML del correo de una cotización con la línea gráfica institucional."""
    filas = "".join(
        "<tr>"
        f'<td style="padding:6px 8px;border-bottom:1px solid #eeecec;">{i.get("descripcion", "")}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #eeecec;text-align:center;">{i.get("cantidad")}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #eeecec;text-align:right;">{_money(i.get("precio_unitario"))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #eeecec;text-align:right;font-weight:bold;">{_money(i.get("subtotal"))}</td>'
        "</tr>"
        for i in (cotizacion.get("items") or [])
    )

    nota = (f'<p style="color:#4f4f48;font-size:14px;line-height:20px;">{mensaje}</p>'
            if mensaje else "")

    evento = ""
    if cotizacion.get("fecha_evento"):
        evento = f" para el <b>{cotizacion['fecha_evento']}</b>"
        if cotizacion.get("hora"):
            evento += f" a las {cotizacion['hora']}"

    return f"""<html><body style="font-family:Arial,Helvetica,sans-serif;color:#262622;max-width:640px;margin:0 auto;">
  <div style="background-color:#1a6b3a;padding:20px 24px;">
    <h1 style="color:#ffffff;margin:0;font-size:19px;">Cotización {cotizacion.get('numero')}</h1>
    <p style="color:#d4f0e0;margin:6px 0 0 0;font-size:13px;">
      Comfenalco Tolima · Servicios de Recreación — Departamento de Alimentos
    </p>
  </div>
  <div style="border:1px solid #e0e0e0;border-top:none;padding:24px;">
    <p style="font-size:15px;">Estimado(a) <b>{cotizacion.get('contacto') or cotizacion.get('cliente')}</b>,</p>
    <p style="font-size:14px;line-height:20px;">
      Adjuntamos la cotización <b>{cotizacion.get('numero')}</b> del proveedor
      <b>{cotizacion.get('proveedor_nombre') or ''}</b>{evento}.
    </p>
    {nota}
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:12px;">
      <tr style="background:#f7f7f6;">
        <th style="text-align:left;padding:8px;">Descripción</th>
        <th style="padding:8px;">Cant.</th>
        <th style="text-align:right;padding:8px;">Valor unitario</th>
        <th style="text-align:right;padding:8px;">Subtotal</th>
      </tr>
      {filas}
    </table>
    <p style="text-align:right;font-size:17px;font-weight:bold;margin-top:14px;">
      Total: {_money(cotizacion.get('total'))}
    </p>
    <p style="font-size:13px;color:#6b6b63;margin-top:18px;">
      El detalle completo con el membrete institucional va en el PDF adjunto.
    </p>
  </div>
  <div style="padding:14px 24px;color:#8f8f87;font-size:11px;text-align:center;">
    Comfenalco Tolima · Servicios de Recreación · recreacion@comfenalcotolima.com
  </div>
</body></html>"""


def send_solicitud_email(solicitud) -> bool:
    """Correo de aviso al área de recreación cuando entra una solicitud nueva.

    (Se conserva el cuerpo original; ahora reutiliza `enviar_correo` para no
    duplicar el manejo de SMTP.)
    """
    if not _hay_smtp():
        print("[EMAIL] Credenciales SMTP no configuradas, omitiendo envío.")
        return False

    html_body = f"""
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #1a6b3a; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 20px;">
          Nueva Solicitud de Recreación
        </h1>
        <p style="color: #d4f0e0; margin: 5px 0 0 0;">Comfenalco Tolima</p>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; font-weight: bold; color: #555; width: 40%;">Empresa:</td>
              <td style="padding: 8px 0;">{solicitud.empresa}</td></tr>
          <tr style="background:#fff;"><td style="padding: 8px 0; font-weight: bold; color: #555;">Fecha del Evento:</td>
              <td style="padding: 8px 0;">{solicitud.fecha_evento}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #555;">Hora de Inicio:</td>
              <td style="padding: 8px 0;">{solicitud.hora_inicio}</td></tr>
          <tr style="background:#fff;"><td style="padding: 8px 0; font-weight: bold; color: #555;">Hora de Finalización:</td>
              <td style="padding: 8px 0;">{solicitud.hora_fin}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #555;">Ciudad:</td>
              <td style="padding: 8px 0;">{solicitud.ciudad}</td></tr>
          <tr style="background:#fff;"><td style="padding: 8px 0; font-weight: bold; color: #555;">Dirección:</td>
              <td style="padding: 8px 0;">{solicitud.direccion}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #555;">Recreadores:</td>
              <td style="padding: 8px 0;">{solicitud.cantidad_recreadores}</td></tr>
          <tr style="background:#fff;"><td style="padding: 8px 0; font-weight: bold; color: #555;">Cantidad de Personas:</td>
              <td style="padding: 8px 0;">{solicitud.cantidad_personas}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #555;">Tipo de Público:</td>
              <td style="padding: 8px 0;">{solicitud.tipo_publico}</td></tr>
          <tr style="background:#fff;"><td style="padding: 8px 0; font-weight: bold; color: #555;">Tipo de Servicio:</td>
              <td style="padding: 8px 0;">{solicitud.tipo_servicio}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #555;">Contacto:</td>
              <td style="padding: 8px 0;">{solicitud.contacto}</td></tr>
          <tr style="background:#fff;"><td style="padding: 8px 0; font-weight: bold; color: #555;">Teléfono/Email:</td>
              <td style="padding: 8px 0;">{solicitud.telefono_email}</td></tr>
          <tr><td style="padding: 8px 0; font-weight: bold; color: #555; vertical-align: top;">Observaciones:</td>
              <td style="padding: 8px 0;">{solicitud.observaciones or "—"}</td></tr>
        </table>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="color: #888; font-size: 12px; text-align: center;">
          Solicitud #{solicitud.id} | Sistema de Recreación Comfenalco Tolima
        </p>
      </div>
    </body>
    </html>
    """

    try:
        enviado = enviar_correo(
            destinatario=settings.EMAIL_RECREACION,
            asunto=f"Nueva Solicitud de Recreación - {solicitud.empresa}",
            html=html_body,
        )
    except Exception as e:
        print(f"[EMAIL ERROR] No se pudo enviar el correo: {e}")
        return False

    if enviado:
        print(f"[EMAIL] Correo enviado para solicitud #{solicitud.id}")
    return enviado
