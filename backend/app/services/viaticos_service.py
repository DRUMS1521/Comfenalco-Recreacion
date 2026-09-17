"""Consulta de viáticos en el portal Argus de Comfenalco (self-service).

Hechos verificados contra el servicio real (17/09/2026), para no volver a
investigarlos:

* La llamada `GetCargarViaticos` devuelve 200 con el MISMO cuerpo se envíe el
  cookie de sesión, uno inválido o ninguno (md5 idéntico). El cookie NO es
  necesario para consultar; `ARGUS_COOKIE` queda como opcional.
* Lo único que determina el resultado es `pDatos` (empresa-empleado). Si va
  vacío o mal formado, Argus responde HTTP 500.
* De los ~120 campos del registro, solo vienen poblados: `COD_SOLI`, `SEC_CONC`,
  `NOM_VIAT` (motivo), `EST_VICA` (estado), `FEC_INIC`, `FEC_FINA` e `IND_LEGA`
  (legalizado S/N). Todo lo demás llega vacío o a -1/centinela, así que los
  campos de ciudad, hotel, días, resolución y valor NO son un error del mapeo.
* `ACT_HORA` llega siempre como `/Date(-2208970800000)/` (centinela 1900), por eso
  `ultima_actuacion` queda en None: el resumen no aporta fecha de actuación.
"""
import base64
import json
import urllib.request
import urllib.error
from datetime import datetime
from typing import Any, Dict, List

from app.core.config import settings

ARGUS_URL = "https://argus.comfenalco.com.co/selfservice/frmNmVicapL.aspx/GetCargarViaticos"
ARGUS_DETALLE_URL = "https://argus.comfenalco.com.co/selfservice/frmNmVicapLe.aspx"


class ArgusNoConfigurado(Exception):
    pass


class ArgusSesionExpirada(Exception):
    pass


class ArgusError(Exception):
    """Fallo del servicio de Argus (respuesta inesperada)."""


def _parse_fecha(fecha: str):
    try:
        return datetime.strptime(fecha, "%d/%m/%Y")
    except (ValueError, TypeError):
        return datetime.min


def _parse_fecha_aspnet(valor):
    """Convierte "/Date(1767225600000)/" (formato ASP.NET) a "dd/mm/YYYY HH:MM".

    Argus entrega ACT_HORA (última actuación del trámite) en este formato y el
    mapeo lo estaba descartando, aunque es el único dato adicional que la llamada
    de resumen sí devuelve.
    """
    if not isinstance(valor, str):
        return None
    inicio, fin = valor.find("("), valor.find(")")
    if inicio == -1 or fin == -1:
        return None
    try:
        ms = int(valor[inicio + 1:fin])
    except ValueError:
        return None
    if ms <= 0:
        return None
    try:
        return datetime.utcfromtimestamp(ms / 1000).strftime("%d/%m/%Y %H:%M")
    except (OverflowError, OSError, ValueError):
        return None


def _texto(registro: Dict[str, Any], campo: str):
    v = (registro.get(campo) or "").strip()
    return v or None


def _booleano_sn(valor):
    """'S' -> True, 'N' -> False, cualquier otra cosa (vacío, -1, None) -> None."""
    texto = str(valor or "").strip().upper()
    if texto == "S":
        return True
    if texto == "N":
        return False
    return None


def _numero(registro: Dict[str, Any], campo: str):
    v = registro.get(campo)
    return v if isinstance(v, (int, float)) and v != -1 else None


def _url_detalle(registro: Dict[str, Any]) -> str | None:
    """
    Construye el enlace a la página de detalle completo en Argus. Esta página
    solo funciona en el navegador donde la persona ya está logueada en
    Argus (rechaza la sesión si se pide desde el backend) — por eso se
    entrega como link para abrir en una pestaña nueva, no se descarga aquí.
    """
    empresa_empleado = settings.ARGUS_PDATOS.replace("-", "&")
    if not empresa_empleado:
        return None
    sec_conc = registro.get("SEC_CONC")
    cod_soli = registro.get("COD_SOLI")
    if sec_conc in (None, -1) or cod_soli in (None, -1):
        return None
    cadena = f"{empresa_empleado}&{sec_conc}&{cod_soli}&0"
    p_par_data = base64.b64encode(cadena.encode()).decode()
    return f"{ARGUS_DETALLE_URL}?pParData={p_par_data}"


def _mapear(registro: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "codigo": registro.get("COD_SOLI"),
        "motivo": (registro.get("NOM_VIAT") or "").strip() or "Sin motivo registrado",
        "fecha_inicio": registro.get("FEC_INIC") or None,
        "fecha_fin": registro.get("FEC_FINA") or None,
        "estado": registro.get("EST_VICA") or "Sin estado",
        "ciudad_destino": _texto(registro, "CIU_DEST"),
        "ciudad_origen": _texto(registro, "CIU_ORIG"),
        # Campos adicionales: en la mayoría de los registros Argus no los trae
        # poblados (esta llamada solo devuelve el resumen), pero se exponen
        # por si algún viático sí los tiene.
        # Tres estados: True (S), False (N) y None (Argus no lo informa), para no
        # afirmar que un viático está sin legalizar cuando el dato no viene.
        "legalizado": _booleano_sn(registro.get("IND_LEGA")),
        "numero_dias": _numero(registro, "NUM_DIAS") or _numero(registro, "DIA_NPER"),
        "numero_resolucion": _texto(registro, "NUM_RESO"),
        "descripcion_comision": _texto(registro, "DES_COMI"),
        "motivo_viaje": _texto(registro, "MOT_VIAT"),
        "hotel": _texto(registro, "NOM_HOTE"),
        "valor_total": _numero(registro, "TOT_VIAT"),
        "url_detalle": _url_detalle(registro),
        # Última actuación del trámite en Argus (ACT_HORA, formato ASP.NET)
        "ultima_actuacion": _parse_fecha_aspnet(registro.get("ACT_HORA")),
    }


def get_viaticos() -> List[Dict[str, Any]]:
    # Solo ARGUS_PDATOS es imprescindible: el cookie no influye en esta llamada
    # (verificado con cookie válido, inválido y ausente: misma respuesta). Exigirlo
    # bloqueaba la consulta justo cuando el cookie caducaba.
    if not settings.ARGUS_PDATOS:
        raise ArgusNoConfigurado(
            "Falta configurar ARGUS_PDATOS en el backend (.env), que identifica al "
            "empleado en Argus."
        )

    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Origin": "https://argus.comfenalco.com.co",
        "Referer": "https://argus.comfenalco.com.co/selfservice/frmNmVicapL.aspx",
    }
    if settings.ARGUS_COOKIE:
        headers["Cookie"] = settings.ARGUS_COOKIE

    body = json.dumps({"pDatos": settings.ARGUS_PDATOS}).encode("utf-8")
    req = urllib.request.Request(ARGUS_URL, data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            crudo = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ArgusSesionExpirada(
                "Argus rechazó la consulta (sesión no válida). Revisa ARGUS_PDATOS."
            )
        raise ArgusError(
            f"Argus respondió HTTP {e.code}. Suele indicar que ARGUS_PDATOS está "
            "vacío o mal formado (se espera el formato empresa-empleado)."
        )
    except urllib.error.URLError as e:
        raise ConnectionError(f"No se pudo contactar Argus: {e.reason}")

    try:
        data = json.loads(crudo)
    except ValueError:
        raise ArgusError("Argus devolvió una respuesta que no es JSON.")

    registros = data.get("d") or []
    if not registros and isinstance(data, dict) and "Message" in data:
        # ASP.NET suele devolver { "Message": "..." } cuando la sesión no es válida.
        raise ArgusSesionExpirada(data["Message"])

    viaticos = [_mapear(r) for r in registros]
    viaticos.sort(key=lambda v: _parse_fecha(v["fecha_inicio"] or ""), reverse=True)
    return viaticos
