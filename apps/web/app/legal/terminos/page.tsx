import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import { DATOS_RESPONSABLE, ACTUALIZADO } from "../datos";

export const metadata: Metadata = {
  title: "Términos y condiciones | Vekino",
  description:
    "Condiciones de uso de la plataforma Vekino para conjuntos residenciales, administradores y residentes.",
  alternates: { canonical: "https://vekino.com/legal/terminos" },
};

/**
 * ⚠️ BORRADOR. Redactado sobre la Ley 675 de 2001 (propiedad horizontal) y
 * el Estatuto del Consumidor, pero NO es asesoría legal y no ha sido
 * revisado por un abogado. Antes de publicarlo hay que:
 *
 *   1. Completar `DATOS_RESPONSABLE` en `app/legal/datos.ts`.
 *   2. Cuadrar los plazos y condiciones comerciales con lo que realmente
 *      dice el contrato que se firma con cada conjunto (permanencia,
 *      preaviso, disponibilidad, precios).
 *   3. Pasarlo por revisión jurídica.
 */
export default function TerminosPage() {
  return (
    <LegalPage
      titulo="Términos y condiciones de uso"
      resumen="Las reglas del servicio: qué ofrece Vekino, qué esperamos de quien lo usa y cómo se resuelven las cosas cuando algo falla."
      actualizado={ACTUALIZADO}
    >
      <div className="legal-nota">
        <p>
          <strong>Documento en revisión.</strong> Estos términos se encuentran
          en revisión jurídica. El contrato firmado entre Vekino y cada
          copropiedad prevalece sobre este texto en caso de discrepancia.
          Escríbenos a{" "}
          <a href={`mailto:${DATOS_RESPONSABLE.correo}`}>
            {DATOS_RESPONSABLE.correo}
          </a>{" "}
          si necesitas la versión contractual.
        </p>
      </div>

      <h2>1. Quiénes somos y qué aceptas</h2>
      <p>
        Vekino es una plataforma de {DATOS_RESPONSABLE.razonSocial} (NIT{" "}
        {DATOS_RESPONSABLE.nit}) para la administración de conjuntos
        residenciales y copropiedades sometidas al régimen de propiedad
        horizontal.
      </p>
      <p>
        Al crear una cuenta, ingresar o usar la plataforma aceptas estos
        términos. Si no estás de acuerdo, no uses el servicio.
      </p>

      <h2>2. Quién puede usar la plataforma</h2>
      <p>
        Las cuentas no son de registro abierto: las crea la administración del
        conjunto que contrató el servicio. Existen perfiles con permisos
        distintos —administración, consejo, contabilidad, residentes,
        propietarios y personal de vigilancia— y cada uno accede únicamente a la
        información que le corresponde.
      </p>
      <p>
        Debes ser mayor de edad y tener un vínculo vigente con la copropiedad
        (propietario, residente, arrendatario, miembro del consejo o personal
        autorizado).
      </p>

      <h2>3. Tu cuenta</h2>
      <ul>
        <li>
          Eres responsable de la confidencialidad de tu contraseña y de todo lo
          que ocurra bajo tu cuenta.
        </li>
        <li>
          Avísanos de inmediato si detectas un acceso no autorizado, escribiendo
          a{" "}
          <a href={`mailto:${DATOS_RESPONSABLE.correo}`}>
            {DATOS_RESPONSABLE.correo}
          </a>
          .
        </li>
        <li>
          Cuando termina tu vínculo con la copropiedad, la administración puede
          desactivar tu cuenta.
        </li>
      </ul>

      <h2>4. Uso aceptable</h2>
      <p>Al usar Vekino te comprometes a no:</p>
      <ul>
        <li>
          Suplantar a otra persona ni autorizar visitantes en nombre de terceros
          sin su consentimiento.
        </li>
        <li>
          Publicar contenido ilegal, difamatorio, discriminatorio o que vulnere
          la intimidad de otros residentes.
        </li>
        <li>
          Extraer, copiar o comercializar datos de otros residentes obtenidos a
          través de la plataforma.
        </li>
        <li>
          Intentar vulnerar la seguridad del sistema, acceder a información de
          otras unidades o interferir con su funcionamiento.
        </li>
        <li>
          Usar la plataforma para fines distintos a la administración de la
          copropiedad.
        </li>
      </ul>
      <p>
        El incumplimiento puede llevar a la suspensión de la cuenta, sin
        perjuicio de las acciones legales que correspondan.
      </p>

      <h2>5. Responsabilidad sobre el contenido</h2>
      <p>
        La información que se carga en la plataforma —cuentas de cobro,
        comunicados, actas, reglamentos, registros de portería— es
        responsabilidad de quien la publica y, en particular, de la
        administración del conjunto.
      </p>
      <p>
        Vekino provee la herramienta; no verifica ni valida el contenido de las
        cuentas de cobro, los estados financieros ni las decisiones de la
        asamblea, y no es parte de las relaciones entre la copropiedad y sus
        residentes.
      </p>

      <h2>6. Pagos en línea</h2>
      <p>
        Cuando el conjunto habilita el pago en línea, la transacción la procesa
        la pasarela y la entidad financiera correspondiente. Vekino registra el
        resultado del pago pero no almacena datos de tarjetas ni de cuentas
        bancarias.
      </p>
      <p>
        Las devoluciones, los reversos y las disputas se tramitan con la
        administración del conjunto y con la entidad financiera, conforme a sus
        propias reglas.
      </p>

      <h2>7. Disponibilidad del servicio</h2>
      <p>
        Trabajamos para mantener la plataforma disponible de forma continua,
        pero puede haber interrupciones por mantenimiento programado, fallas de
        proveedores de infraestructura o causas fuera de nuestro control.
      </p>
      <p>
        El mantenimiento programado se avisa con anticipación cuando implique
        indisponibilidad. Los niveles de servicio comprometidos, si los hay,
        constan en el contrato firmado con la copropiedad.
      </p>

      <h2>8. Planes, precios y vigencia</h2>
      <p>
        El plan contratado, su precio y su vigencia constan en el contrato
        suscrito con la copropiedad. Los valores publicados en el sitio son
        informativos y pueden cambiar; los cambios de precio se avisan con
        anticipación y no afectan el período ya facturado.
      </p>
      <p>
        La terminación del servicio se rige por lo pactado en ese contrato. A la
        terminación, la copropiedad puede solicitar la exportación de su
        información dentro del plazo allí previsto.
      </p>

      <h2>9. Propiedad intelectual</h2>
      <p>
        El software, la marca, el diseño y la documentación de Vekino son de{" "}
        {DATOS_RESPONSABLE.razonSocial}. El uso de la plataforma no transfiere
        ningún derecho sobre ellos.
      </p>
      <p>
        La información cargada por la copropiedad sigue siendo suya. Nos
        autoriza a tratarla únicamente para prestar el servicio, en los términos
        de la <a href="/legal/privacidad">política de tratamiento de datos</a>.
      </p>

      <h2>10. Limitación de responsabilidad</h2>
      <p>
        Vekino responde por los daños directos que le sean imputables, en los
        términos y límites acordados en el contrato con la copropiedad. No
        responde por decisiones administrativas o de la asamblea, por la
        exactitud de la información cargada por terceros, ni por perjuicios
        derivados del uso indebido de las credenciales de acceso.
      </p>
      <p>
        Nada en estos términos limita los derechos que la ley colombiana
        reconoce de forma irrenunciable a los consumidores.
      </p>

      <h2>11. Protección de datos</h2>
      <p>
        El tratamiento de datos personales se rige por nuestra{" "}
        <a href="/legal/privacidad">política de tratamiento de datos</a>,
        redactada conforme a la Ley 1581 de 2012.
      </p>

      <h2>12. Cambios en estos términos</h2>
      <p>
        Podemos actualizarlos. Cuando el cambio sea sustancial, lo avisaremos
        con al menos quince (15) días de anticipación a través de la plataforma
        o por correo. Seguir usando el servicio después de esa fecha implica
        aceptar la nueva versión.
      </p>

      <h2>13. Ley aplicable y controversias</h2>
      <p>
        Estos términos se rigen por la ley colombiana. Las controversias se
        intentarán resolver de forma directa; de no lograrse, se someterán a los
        jueces competentes de la República de Colombia.
      </p>

      <h2>14. Contacto</h2>
      <p>
        {DATOS_RESPONSABLE.razonSocial} · NIT {DATOS_RESPONSABLE.nit} ·{" "}
        {DATOS_RESPONSABLE.direccion}
        <br />
        <a href={`mailto:${DATOS_RESPONSABLE.correo}`}>
          {DATOS_RESPONSABLE.correo}
        </a>{" "}
        · {DATOS_RESPONSABLE.telefono}
      </p>
    </LegalPage>
  );
}
