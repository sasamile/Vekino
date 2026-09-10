#!/usr/bin/env bash
# Set de pruebas de la pasarela Aval.
#
# Cada caso crea su transaccion, guarda el comprobante tecnico en
# evidencias/ y abre la URL de la pasarela en el navegador por defecto —el
# tuyo, que ya tiene aceptado el certificado de QA—.
#
# Uso:   ./scripts/certificacion.sh a        (un caso)
#        ./scripts/certificacion.sh estado   (consulta todos los guardados)
set -euo pipefail
cd "$(dirname "$0")/../packages/backend"
EV="../../evidencias"; mkdir -p "$EV"

crear () { # nombre monto persona
  local caso="$1" monto="$2" persona="$3"
  echo "── Caso $caso · $(printf "%'d" "$monto") COP · persona $persona"
  local out
  out=$(npx convex run pagos:crearTrnCertificacion \
        "{\"monto\":$monto,\"tipoPersona\":\"$persona\"}" 2>/dev/null \
        | grep -v Ignoring)
  echo "$out" > "$EV/caso-$caso.json"
  local url pmt
  url=$(python3 -c "import json,sys;print(json.load(open('$EV/caso-$caso.json'))['urlPasarela'])")
  pmt=$(python3 -c "import json,sys;print(json.load(open('$EV/caso-$caso.json'))['pmtAuthId'])")
  echo "   PmtAuthId: $pmt"
  echo "   Guardado : evidencias/caso-$caso.json"
  echo "   Abriendo la pasarela…"
  open "$url"
}

case "${1:-}" in
  a) crear a  850000       natural  ;;   # < 1 millon, persona natural
  b) crear b  850000       juridica ;;   # < 1 millon, persona juridica
  c) crear c  300000000    natural  ;;   # 300 millones
  d) crear d  6000000000   juridica ;;   # 6 mil millones
  e) crear e  120000       natural  ;;   # cerrar la ventana -> queda pendiente
  f) crear f  120000       natural  ;;   # cancelar -> vuelve al comercio
  estado)
     for f in "$EV"/caso-*.json; do
       [ -e "$f" ] || continue
       pmt=$(python3 -c "import json;print(json.load(open('$f'))['pmtAuthId'])")
       printf "%-16s " "$(basename "$f" .json)"
       npx convex run pagos:evidenciaCertificacion "{\"pmtAuthId\":\"$pmt\"}" 2>/dev/null \
         | grep -v Ignoring \
         | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f\"{d['pmtAuthId']}  ref {d['referencia']}  \$ {int(d['monto'] or 0):,}  {d['statusCode']} {d['estadoLegible']}\")"
     done ;;
  *) echo "Casos: a b c d e f · o 'estado' para consultarlos todos"; exit 1 ;;
esac
