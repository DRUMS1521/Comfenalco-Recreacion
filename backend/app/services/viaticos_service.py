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


def _parse_fecha(fecha: str):
    try:
        return datetime.strptime(fecha, "%d/%m/%Y")
    except (ValueError, TypeError):
        return datetime.min


def _texto(registro: Dict[str, Any], campo: str):
    v = (registro.get(campo) or "").strip()
    return v or None


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
        "legalizado": (registro.get("IND_LEGA") or "").strip().upper() == "S",
        "numero_dias": _numero(registro, "NUM_DIAS") or _numero(registro, "DIA_NPER"),
        "numero_resolucion": _texto(registro, "NUM_RESO"),
        "descripcion_comision": _texto(registro, "DES_COMI"),
        "motivo_viaje": _texto(registro, "MOT_VIAT"),
        "hotel": _texto(registro, "NOM_HOTE"),
        "valor_total": _numero(registro, "TOT_VIAT"),
        "url_detalle": _url_detalle(registro),
    }


def get_viaticos() -> List[Dict[str, Any]]:
    if not settings.ARGUS_COOKIE or not settings.ARGUS_PDATOS:
        raise ArgusNoConfigurado(
            "Falta configurar ARGUS_COOKIE y ARGUS_PDATOS en el backend (.env)."
        )

    body = json.dumps({"pDatos": settings.ARGUS_PDATOS}).encode("utf-8")
    req = urllib.request.Request(
        ARGUS_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Cookie": settings.ARGUS_COOKIE,
            "Origin": "https://argus.comfenalco.com.co",
            "Referer": "https://argus.comfenalco.com.co/selfservice/frmNmVicapL.aspx",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise ArgusSesionExpirada(
                "La sesión de Argus expiró o no es válida. Actualiza ARGUS_COOKIE en .env."
            )
        raise
    except urllib.error.URLError as e:
        raise ConnectionError(f"No se pudo contactar Argus: {e.reason}")

    registros = data.get("d") or []
    if not registros and isinstance(data, dict) and "Message" in data:
        # ASP.NET suele devolver { "Message": "..." } cuando la sesión no es válida.
        raise ArgusSesionExpirada(data["Message"])

    viaticos = [_mapear(r) for r in registros]
    viaticos.sort(key=lambda v: _parse_fecha(v["fecha_inicio"] or ""), reverse=True)
    return viaticos
