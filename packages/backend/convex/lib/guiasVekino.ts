/**
 * Lo que el agente de WhatsApp sabe sobre cómo se usa la plataforma.
 *
 * Está sacado de la interfaz real, con los textos literales de los botones.
 * Es deliberadamente específico: mandar a alguien a un botón que no existe es
 * peor que no responderle, porque pierde la confianza y llama igual.
 *
 * Si la UI cambia, esto se queda mintiendo. Actualizarlo es parte de tocar
 * las pantallas de asamblea.
 */

export const GUIAS_VEKINO = `
=== CÓMO SE USA LA PLATAFORMA (guías verificadas) ===

Antes de dar pasos, ten en cuenta dos cosas que lo cambian todo:
- La MODALIDAD de la asamblea (presencial, virtual o mixta) sale en letra
  pequeña junto a la fecha y la hora. La asistencia funciona distinto en cada una.
- El ESTADO de la asamblea: "Programada", "En curso" o "Finalizada".
Si no lo sabes y hace falta, pregúntalo antes de guiar.

--- LLEGAR A LA ASAMBLEA ---
En el menú lateral (en celular: tocar el ícono de tres rayas arriba a la
izquierda), bajo "Comunidad", tocar "Asambleas". Luego tocar el botón de la
tarjeta de la asamblea: dice "Ver asamblea" si está Programada, "Entrar a la
asamblea" si está En curso, o "Ver resultados" si Finalizada.
Adentro hay tres pestañas: "Votar", "Poderes" y "Resultados".
NO existe ninguna opción "Poderes" en el menú lateral: está DENTRO de la asamblea.

--- OTORGAR UN PODER (delegar mi voto) ---
Solo se puede mientras la asamblea esté "Programada". Cuando inicia, la
pestaña "Poderes" DESAPARECE y solo la administración puede registrarlos.

Ruta: Asambleas → "Ver asamblea" → pestaña "Poderes" → tarjeta "Delegar mi
voto a otra persona". Hay dos opciones:

A) "Propietario del conjunto" (la persona ya tiene cuenta en Vekino):
   1. Bajo "Unidades a delegar", TOCAR la burbuja de la unidad (ej.
      "Apartamento 703 · Torre T-III"). Al tocarla cambia de color y aparece
      un chulito ✓. Con varias unidades existe el enlace "Seleccionar todas".
   2. En "Buscar propietario" escribir nombre o correo (mínimo 2 letras) y
      TOCAR el nombre en la lista que aparece. No basta con escribirlo: si no
      lo toca, queda sin seleccionar. Al quedar bien dice "Seleccionado · toca
      la X para cambiar".
   3. Adjuntar el poder firmado y tocar "Otorgar poder".
   OJO: ese poder NO queda activo hasta que el apoderado entre a su propia
   pestaña "Poderes", vea "Poderes que me dieron" y toque el botón verde
   "Aceptar". Mientras no acepte, no cuenta.

B) "Otra persona" (alguien externo, sin cuenta):
   1. Tocar la unidad igual que arriba (que quede con el chulito ✓).
   2. Llenar "Nombre" (obligatorio). "Documento (opcional)" se puede dejar vacío.
   3. Adjuntar el poder firmado y tocar "Otorgar poder".
   4. Sale un recuadro verde "Poder listo para {nombre}" con el CÓDIGO y
      botones "Copiar enlace", "Copiar código" y "Copiar mensaje", más un
      bloque para enviárselo por WhatsApp. Hay que hacerle llegar ese enlace.

EL DOCUMENTO DEL PODER ES OBLIGATORIO en ambos casos: "Documento del poder
(obligatorio) — PDF o foto", con los botones "Seleccionar archivo" o "Tomar
foto". Desde el celular, "Tomar foto" abre la cámara y la convierte sola a PDF.

*** LA CAUSA #1 DE QUE LA GENTE SE TRABE ***
El botón "Otorgar poder" está gris hasta que se cumplan TRES cosas:
unidad tocada + apoderado definido + documento adjunto.
Si falta el documento, avisa: "Adjunta el poder firmado para habilitar el botón."
Pero si lo que falta es TOCAR LA UNIDAD o el nombre, el botón sigue gris SIN
decir nada. Ninguna unidad viene preseleccionada, ni siquiera cuando la
persona tiene una sola.
Si alguien dice que el botón no se activa, pregúntale primero si tocó la
unidad hasta que cambiara de color.

Otras cosas que salen:
- Una unidad solo admite un poder por asamblea ("Esta unidad ya tiene un
  poder en esta asamblea").
- No se puede dar el poder a uno mismo.
- Si la búsqueda dice "Sin resultados", esa persona no tiene cuenta: usar
  la opción "Otra persona".
- Si no aparece la tarjeta de delegar, esa cuenta no tiene unidades
  vinculadas: lo arregla la administración.

--- ASISTENCIA: NO HAY BOTÓN DE "MARCAR ASISTENCIA" ---
No existe ningún botón que diga "Marcar asistencia" ni "Confirmar
asistencia". Nunca mandes a nadie a buscarlo. Depende de la modalidad:

- VIRTUAL: basta con ENTRAR A LA SALA el día de la asamblea. Se registra
  sola al abrirse la pantalla. Para comprobarlo, en la barra de abajo está el
  ícono de personas ("Panel de la asamblea") y ahí dice en verde "Asistencia
  registrada".
- MIXTA: botón "Sí, estoy presente" en la pestaña "Votar".
- VIRTUAL por fuera (Meet/Zoom): la administración proyecta un código de 6
  caracteres que se escribe en la pestaña "Votar".
- PRESENCIAL: el residente muestra su QR en el punto de control y ahí lo
  registran. No se auto-registra.

--- LA SALA ---
Mientras la asamblea esté "Programada" sale un aviso ámbar: "Sala cerrada ·
puedes cargar poderes". Es normal, no es un error: la administración la abre
al iniciar la reunión. Mientras tanto sí se pueden cargar poderes.
Cuando inicia aparece "En vivo" y el botón "Entrar a la sala". Ese botón no
existe antes, ni en asambleas presenciales.
Salirse de la sala no borra la asistencia ya registrada.

--- APODERADO EXTERNO (sin cuenta en Vekino) ---
Entra por el enlace personal que le compartió el propietario:
https://www.vekino.com/apoderado?codigo=XXXXXX — con abrirlo entra solo, sin
correo ni contraseña.
Si solo tiene el código: ir a https://www.vekino.com/apoderado, escribirlo en
"Código de acceso" y tocar "Ingresar" (el botón se activa desde 4 caracteres;
el código va en mayúsculas y nunca lleva O, 0, I, 1 ni L).
Adentro ve las casas que representa, el quórum, el orden del día y puede
votar. La asistencia se le registra al entrar a la sala el día de la asamblea.
Ese enlace es personal: quien lo tenga puede votar por esa unidad, así que no
debe reenviarse a grupos.
Si esa persona además tiene cuenta propia, le conviene entrar con su cuenta:
así vota por sus unidades Y por las delegadas (tras aceptar el poder).
`.trim();
