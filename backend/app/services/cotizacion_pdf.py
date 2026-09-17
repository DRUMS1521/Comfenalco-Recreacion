"""PDF de cotización con membrete de Comfenalco Tolima.

Se arma con reportlab (Python puro, sin dependencias del sistema, para que
funcione igual en local y en el despliegue):

* Membrete en cada página: franja verde institucional con el logo, el nombre de la
  entidad y el proveedor; al pie la línea dorada y los datos de contacto.
* Bloque de cliente y evento, tabla de líneas con encabezado corporativo, total
  destacado y notas/condiciones.
* La paginación es automática (platypus): una cotización con muchas líneas sigue
  saliendo con su membrete en todas las páginas.
"""
import os
from datetime import date
from io import BytesIO
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

VERDE = colors.HexColor("#1a6b3a")
VERDE_OSCURO = colors.HexColor("#134527")
DORADO = colors.HexColor("#cdac70")
TINTA = colors.HexColor("#262622")
GRIS = colors.HexColor("#6b6b63")
GRIS_CLARO = colors.HexColor("#f2f2f0")

LOGO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "assets", "logo-comfenalco.png")

ENTIDAD = "Comfenalco Tolima"
DEPENDENCIA = "Servicios de Recreación · Departamento de Alimentos"
CONTACTO_PIE = ("Comfenalco Tolima · Servicios de Recreación · "
                "recreacion@comfenalcotolima.com · Tel. (608) 264 5050 · Ibagué, Tolima")

ANCHO_UTIL = A4[0] - 36 * mm


def _money(valor) -> str:
    try:
        return "$ " + f"{float(valor or 0):,.0f}".replace(",", ".")
    except (TypeError, ValueError):
        return "$ 0"


def _fecha_larga(iso: str) -> str:
    if not iso:
        return "—"
    nombres = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
               "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
    try:
        anio, mes, dia = (int(p) for p in iso.split("-"))
        return f"{dia} de {nombres[mes - 1]} de {anio}"
    except (ValueError, IndexError):
        return iso


def _estilos():
    base = getSampleStyleSheet()
    return {
        "titulo": ParagraphStyle("titulo", parent=base["Normal"], fontName="Helvetica-Bold",
                                 fontSize=15, leading=18, textColor=colors.white),
        "subtitulo": ParagraphStyle("subtitulo", parent=base["Normal"], fontName="Helvetica",
                                    fontSize=8.5, leading=11, textColor=colors.HexColor("#d4f0e0")),
        "seccion": ParagraphStyle("seccion", parent=base["Normal"], fontName="Helvetica-Bold",
                                  fontSize=8, leading=10, textColor=VERDE, spaceAfter=2),
        "campo": ParagraphStyle("campo", parent=base["Normal"], fontName="Helvetica-Bold",
                                fontSize=7, leading=9, textColor=GRIS),
        "valor": ParagraphStyle("valor", parent=base["Normal"], fontName="Helvetica",
                                fontSize=9.5, leading=12, textColor=TINTA),
        "celda": ParagraphStyle("celda", parent=base["Normal"], fontName="Helvetica",
                                fontSize=8.5, leading=11, textColor=TINTA),
        "celdaB": ParagraphStyle("celdaB", parent=base["Normal"], fontName="Helvetica-Bold",
                                 fontSize=8.5, leading=11, textColor=TINTA),
        "encabezado": ParagraphStyle("encabezado", parent=base["Normal"], fontName="Helvetica-Bold",
                                     fontSize=8, leading=10, textColor=colors.white),
        "nota": ParagraphStyle("nota", parent=base["Normal"], fontName="Helvetica",
                               fontSize=8, leading=11, textColor=GRIS),
        "numero": ParagraphStyle("numero", parent=base["Normal"], fontName="Helvetica-Bold",
                                 fontSize=11, leading=14, textColor=VERDE_OSCURO, alignment=TA_RIGHT),
        "fechaDoc": ParagraphStyle("fechaDoc", parent=base["Normal"], fontName="Helvetica",
                                   fontSize=8, leading=10, textColor=GRIS, alignment=TA_RIGHT),
        "total": ParagraphStyle("total", parent=base["Normal"], fontName="Helvetica-Bold",
                                fontSize=12, leading=14, textColor=colors.white, alignment=TA_RIGHT),
    }


def _membrete(canvas, doc, proveedor: str):
    """Franja institucional + pie. Se dibuja en cada página."""
    ancho, alto = A4
    # Franja verde superior
    canvas.setFillColor(VERDE)
    canvas.rect(0, alto - 30 * mm, ancho, 30 * mm, stroke=0, fill=1)
    canvas.setFillColor(DORADO)
    canvas.rect(0, alto - 31.2 * mm, ancho, 1.2 * mm, stroke=0, fill=1)
    # Logo sobre recuadro blanco (el logotipo trae texto oscuro: sobre el verde
    # institucional solo se lee bien con fondo claro, igual que en la aplicación)
    canvas.setFillColor(colors.white)
    canvas.roundRect(17 * mm, alto - 25 * mm, 21 * mm, 21 * mm, 2 * mm, stroke=0, fill=1)
    try:
        canvas.drawImage(LOGO, 19 * mm, alto - 23.5 * mm, width=17 * mm, height=17 * mm,
                         mask="auto")
    except Exception:
        pass
    # Títulos
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 15)
    canvas.drawString(42 * mm, alto - 14 * mm, ENTIDAD.upper())
    canvas.setFont("Helvetica", 8.5)
    canvas.setFillColor(colors.HexColor("#d4f0e0"))
    canvas.drawString(42 * mm, alto - 19.5 * mm, DEPENDENCIA)
    canvas.drawString(42 * mm, alto - 24 * mm, f"Proveedor: {proveedor}")
    # Número de documento
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 11)
    canvas.drawRightString(ancho - 18 * mm, alto - 14 * mm, doc.cotizacion["numero"])
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(ancho - 18 * mm, alto - 19 * mm,
                           f"Emitida el {doc.cotizacion['fecha_emision']}")
    # Pie
    canvas.setStrokeColor(DORADO)
    canvas.setLineWidth(0.8)
    canvas.line(18 * mm, 16 * mm, ancho - 18 * mm, 16 * mm)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(GRIS)
    canvas.drawString(18 * mm, 12 * mm, CONTACTO_PIE)
    canvas.drawRightString(ancho - 18 * mm, 12 * mm, f"Página {doc.page}")


def _tabla_datos(cot: Dict[str, Any], est) -> Table:
    def campo(etiqueta, valor):
        return [Paragraph(etiqueta.upper(), est["campo"]), Paragraph(str(valor or "—"), est["valor"])]

    izquierda = [
        campo("Cliente", cot.get("cliente")),
        campo("NIT", cot.get("nit_cliente")),
        campo("Contacto", cot.get("contacto")),
        campo("Teléfono / email", cot.get("telefono_email")),
    ]
    derecha = [
        campo("Fecha del evento", _fecha_larga(cot.get("fecha_evento"))),
        campo("Hora", cot.get("hora")),
        campo("Personas", cot.get("cantidad_personas")),
        campo("Ciudad / dirección", " · ".join(
            [p for p in [cot.get("ciudad"), cot.get("direccion")] if p])),
    ]
    filas = [[izquierda[i][0], izquierda[i][1], derecha[i][0], derecha[i][1]] for i in range(4)]
    tabla = Table(filas, colWidths=[24 * mm, 66 * mm, 30 * mm, 58 * mm])
    tabla.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tabla


def _tabla_items(items: List[Dict[str, Any]], est) -> Table:
    filas = [[
        Paragraph("#", est["encabezado"]),
        Paragraph("Descripción", est["encabezado"]),
        Paragraph("Cant.", est["encabezado"]),
        Paragraph("Valor unitario", est["encabezado"]),
        Paragraph("Subtotal", est["encabezado"]),
    ]]
    for i, it in enumerate(items, 1):
        detalle = it.get("descripcion") or ""
        extra = []
        if it.get("presentacion"):
            extra.append(it["presentacion"])
        incs = []
        if it.get("inc_empaque"):
            incs.append(f"empaque {_money(it['inc_empaque'])}")
        if it.get("inc_bebida"):
            incs.append(f"bebida {_money(it['inc_bebida'])}")
        if it.get("inc_jugo"):
            incs.append(f"jugo {_money(it['inc_jugo'])}")
        if incs:
            extra.append("+ " + ", ".join(incs))
        sub = f'<font size="7.5" color="#6b6b63">{" · ".join(extra)}</font>' if extra else ""
        filas.append([
            Paragraph(str(i), est["celda"]),
            Paragraph(f"{detalle}{'<br/>' + sub if sub else ''}", est["celda"]),
            Paragraph(str(it.get("cantidad")), est["celda"]),
            Paragraph(_money(it.get("precio_unitario")), est["celda"]),
            Paragraph(_money(it.get("subtotal")), est["celdaB"]),
        ])
    tabla = Table(filas, colWidths=[8 * mm, 98 * mm, 14 * mm, 30 * mm, 28 * mm], repeatRows=1)
    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), VERDE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, colors.HexColor("#dcdcd8")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#dcdcd8")),
    ]
    for fila in range(1, len(filas)):
        if fila % 2 == 0:
            estilo.append(("BACKGROUND", (0, fila), (-1, fila), GRIS_CLARO))
    tabla.setStyle(TableStyle(estilo))
    return tabla


def _tabla_total(total: float, unidades: int, est) -> Table:
    tabla = Table(
        [[Paragraph(f"TOTAL ({unidades} unidades)", est["encabezado"]),
          Paragraph(_money(total), est["total"])]],
        colWidths=[110 * mm, 68 * mm],
    )
    tabla.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), VERDE_OSCURO),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (0, 0), 8),
        ("RIGHTPADDING", (-1, 0), (-1, 0), 8),
    ]))
    return tabla


def generar_pdf(cotizacion: Dict[str, Any]) -> bytes:
    """Devuelve el PDF de la cotización (ya serializado en bytes)."""
    est = _estilos()
    buffer = BytesIO()

    doc = BaseDocTemplate(
        buffer, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm, topMargin=38 * mm, bottomMargin=22 * mm,
        title=f"Cotización {cotizacion['numero']}",
        author=ENTIDAD,
        subject=f"Cotización {cotizacion['numero']} · {cotizacion.get('cliente', '')}",
    )
    doc.cotizacion = {
        "numero": cotizacion["numero"],
        "fecha_emision": _fecha_larga(str(date.today())),
    }
    proveedor = cotizacion.get("proveedor_nombre") or "—"

    marco = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="cuerpo")
    doc.addPageTemplates([
        PageTemplate(id="membrete", frames=[marco],
                     onPage=lambda c, d: _membrete(c, d, proveedor)),
    ])

    historia = []
    historia.append(Paragraph("DATOS DEL CLIENTE Y DEL EVENTO", est["seccion"]))
    historia.append(_tabla_datos(cotizacion, est))
    historia.append(Spacer(1, 6 * mm))

    historia.append(Paragraph("DETALLE DE LA COTIZACIÓN", est["seccion"]))
    items = cotizacion.get("items") or []
    if items:
        historia.append(_tabla_items(items, est))
    else:
        historia.append(Paragraph("Sin líneas registradas.", est["nota"]))
    historia.append(Spacer(1, 4 * mm))

    unidades = sum(int(i.get("cantidad") or 0) for i in items)
    historia.append(_tabla_total(cotizacion.get("total") or 0, unidades, est))

    notas = []
    if cotizacion.get("observaciones"):
        notas.append(("Observaciones", cotizacion["observaciones"]))
    if cotizacion.get("condiciones"):
        notas.append(("Condiciones comerciales", cotizacion["condiciones"]))
    if notas:
        bloque = [Spacer(1, 6 * mm), Paragraph("NOTAS Y CONDICIONES", est["seccion"])]
        for etiqueta, texto in notas:
            bloque.append(Paragraph(f"<b>{etiqueta}:</b> {texto}", est["nota"]))
            bloque.append(Spacer(1, 1.5 * mm))
        historia.append(KeepTogether(bloque))

    historia.append(Spacer(1, 10 * mm))
    historia.append(Paragraph(
        "Esta cotización tiene una vigencia de 30 días calendario a partir de su emisión. "
        "Los precios corresponden al portafolio vigente 2026 del proveedor y están sujetos a "
        "disponibilidad. Las cantidades mínimas de despacho se cobran según el portafolio.",
        est["nota"]))
    historia.append(Spacer(1, 8 * mm))
    historia.append(Paragraph(
        f"Elaborada por: {cotizacion.get('creado_por_nombre') or 'Comfenalco Tolima'} · "
        f"Área de Recreación", est["nota"]))

    doc.build(historia)
    return buffer.getvalue()
