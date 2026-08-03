import type { Metadata } from "next";
import { LegalPage } from "@/components/landing/legal-page";
import { DATOS_RESPONSABLE, ACTUALIZADO } from "../datos";

export const metadata: Metadata = {
  title: "Política de privacidad | Vekino",
  description:
    "Cómo Vekino recolecta, usa y protege los datos personales de administradores, residentes y personal de vigilancia.",
  alternates: { canonical: "https://vekino.com/legal/privacidad" },
};

/**
 * ⚠️ BORRADOR. Este texto está redactado sobre la Ley 1581 de 2012 y el
 * Decreto 1074 de 2015 (régimen colombiano de protección de datos), pero
 * NO es asesoría legal y no ha sido revisado por un abogado. Antes de
 * publicarlo hay que:
 *
 *   1. Completar `DATOS_RESPONSABLE` en `app/legal/datos.ts`.
 *   2. Verificar los plazos, las finalidades y los encargados reales
 *      (Convex, el proveedor de correo, la pasarela Aval/PSE, etc.).
 *   3. Pasarlo por revisión jurídica.
 */
export default function PrivacidadPage() {
  return (
    <LegalPage
      titulo="Política de tratamiento de datos personales"
      resumen="Qué datos recogemos, para qué los usamos, con quién los compartimos y cómo puedes ejercer tus derechos sobre ellos."
      actualizado={ACTUALIZADO}
    >
      <div className="legal-nota">
        <p>
          <strong>Documento en revisión.</strong> Esta política está redactada
          conforme a la Ley 1581 de 2012 y se encuentra en revisión jurídica. Si
          necesitas la versión firmada para tu conjunto, escríbenos a{" "}
          <a href={`mailto:${DATOS_RESPONSABLE.correo}`}>
            {DATOS_RESPONSABLE.correo}
          </a>
          .
        </p>
      </div>

      <h2>1. Responsable del tratamiento</h2>
      <p>
        {DATOS_RESPONSABLE.razonSocial}, identificada con NIT{" "}
        {DATOS_RESPONSABLE.nit}, con domicilio en {DATOS_RESPONSABLE.direccion},
        es la responsable del tratamiento de los datos personales recolectados a
        través de la plataforma Vekino.
      </p>
      <ul>
        <li>
          Correo para el ejercicio de derechos:{" "}
          <a href={`mailto:${DATOS_RESPONSABLE.correo}`}>
            {DATOS_RESPONSABLE.correo}
          </a>
        </li>
        <li>Teléfono: {DATOS_RESPONSABLE.telefono}</li>
      </ul>
      <p>
        Cuando un conjunto residencial contrata Vekino, la copropiedad actúa
        como responsable de los datos de sus residentes y Vekino como encargado
        del tratamiento, en los términos del contrato suscrito entre las partes.
      </p>

      <h2>2. Datos que recolectamos</h2>
      <h3>Datos que nos entregas</h3>
      <ul>
        <li>
          <strong>Identificación y contacto:</strong> nombre, documento de
          identidad, correo electrónico, teléfono y unidad residencial.
        </li>
        <li>
          <strong>Información de la copropiedad:</strong> unidades,
          coeficientes, vehículos, mascotas y personas autorizadas.
        </li>
        <li>
          <strong>Información financiera de la administración:</strong> cuentas
          de cobro, pagos registrados y estados de cuenta por unidad.
        </li>
        <li>
          <strong>Registros de acceso:</strong> visitantes autorizados, hora de
          ingreso y salida, paquetería y novedades de portería.
        </li>
        <li>
          <strong>Contenido que publicas:</strong> comunicados, PQRS, reservas,
          documentos y votaciones en asamblea.
        </li>
      </ul>

      <h3>Datos que se generan con el uso</h3>
      <ul>
        <li>
          Datos técnicos de la sesión: dirección IP, tipo de dispositivo y
          navegador, y registros de acceso a la plataforma.
        </li>
        <li>
          Registros de auditoría: qué usuario realizó cada acción sensible
          (autorizar un visitante, registrar un pago, publicar un comunicado) y
          cuándo.
        </li>
      </ul>
      <p>
        <strong>No recolectamos datos sensibles</strong> —origen racial,
        convicciones religiosas o políticas, datos de salud o biométricos— salvo
        que la copropiedad lo requiera expresamente para un caso concreto y
        medie autorización previa, expresa e informada del titular.
      </p>

      <h2>3. Finalidades del tratamiento</h2>
      <ul>
        <li>Prestar los servicios de administración de la copropiedad.</li>
        <li>Gestionar cartera, generar cuentas de cobro y registrar pagos.</li>
        <li>
          Controlar el acceso de visitantes y dejar la trazabilidad que exige la
          seguridad del conjunto.
        </li>
        <li>
          Enviar comunicados, notificaciones y avisos operativos de la
          copropiedad.
        </li>
        <li>Gestionar reservas de zonas comunes y su historial.</li>
        <li>
          Convocar asambleas, verificar quórum, registrar poderes y consolidar
          votaciones.
        </li>
        <li>Atender peticiones, quejas, reclamos y sugerencias.</li>
        <li>Cumplir obligaciones legales, contables y contractuales.</li>
        <li>
          Mejorar la plataforma y diagnosticar fallas, sobre datos agregados o
          seudonimizados.
        </li>
      </ul>
      <p>
        No vendemos datos personales ni los usamos para publicidad de terceros.
      </p>

      <h2>4. Con quién compartimos la información</h2>
      <p>
        Compartimos datos únicamente con quienes son necesarios para prestar el
        servicio, bajo contrato y con obligaciones de confidencialidad:
      </p>
      <ul>
        <li>
          <strong>La administración de tu conjunto</strong>, según el perfil de
          cada usuario. Un residente no ve los datos de otras unidades.
        </li>
        <li>
          <strong>Proveedores de infraestructura</strong> que alojan la base de
          datos y los archivos de la plataforma.
        </li>
        <li>
          <strong>Pasarelas de pago</strong>, cuando el conjunto habilita el
          pago en línea. Los datos de la transacción los procesa directamente la
          entidad financiera; Vekino no almacena números de tarjeta.
        </li>
        <li>
          <strong>Servicios de correo y notificaciones</strong>, para entregar
          comunicados y avisos.
        </li>
        <li>
          <strong>Autoridades</strong>, cuando exista orden judicial o
          requerimiento legal.
        </li>
      </ul>
      <p>
        Algunos de estos proveedores operan servidores fuera de Colombia. En
        esos casos, la transferencia se realiza con las garantías que exige la
        normativa vigente sobre transferencia internacional de datos.
      </p>

      <h2>5. Tus derechos como titular</h2>
      <p>Conforme a la Ley 1581 de 2012 puedes, en cualquier momento:</p>
      <ul>
        <li>Conocer, actualizar y rectificar tus datos personales.</li>
        <li>
          Solicitar prueba de la autorización otorgada, salvo cuando la ley no
          la exija.
        </li>
        <li>
          Ser informado sobre el uso que se ha dado a tus datos personales.
        </li>
        <li>
          Presentar quejas ante la Superintendencia de Industria y Comercio por
          infracciones a la normativa.
        </li>
        <li>
          Revocar la autorización o solicitar la supresión de tus datos, cuando
          no exista un deber legal o contractual que lo impida.
        </li>
        <li>Acceder de forma gratuita a tus datos personales.</li>
      </ul>
      <p>
        Ten en cuenta que ciertos registros —cartera, actas de asamblea y
        bitácoras de acceso— deben conservarse por obligación legal o
        contractual de la copropiedad, aun cuando solicites su supresión.
      </p>

      <h2>6. Cómo ejercer tus derechos</h2>
      <p>
        Escribe a{" "}
        <a href={`mailto:${DATOS_RESPONSABLE.correo}`}>
          {DATOS_RESPONSABLE.correo}
        </a>{" "}
        indicando tu nombre completo, el conjunto al que perteneces, la
        solicitud concreta y un correo de contacto.
      </p>
      <ul>
        <li>
          <strong>Consultas:</strong> se atienden en un máximo de diez (10) días
          hábiles, prorrogables por cinco (5) más.
        </li>
        <li>
          <strong>Reclamos:</strong> se atienden en un máximo de quince (15)
          días hábiles, prorrogables por ocho (8) más.
        </li>
      </ul>

      <h2>7. Seguridad de la información</h2>
      <p>
        Aplicamos medidas técnicas, humanas y administrativas razonables para
        proteger los datos: cifrado en tránsito, control de acceso por perfil,
        aislamiento de la información de cada conjunto, registro de auditoría y
        copias de respaldo.
      </p>
      <p>
        Ningún sistema es infalible. Si detectamos un incidente que afecte tus
        datos personales, lo informaremos a la administración de tu conjunto y a
        las autoridades competentes conforme a la ley.
      </p>

      <h2>8. Conservación de los datos</h2>
      <p>
        Conservamos los datos mientras el conjunto mantenga vigente su contrato
        con Vekino y durante los plazos adicionales que exijan las obligaciones
        legales, contables y contractuales. Terminado ese período, los datos se
        eliminan o se anonimizan.
      </p>

      <h2>9. Menores de edad</h2>
      <p>
        La plataforma está dirigida a personas mayores de edad. Los datos de
        menores que residen en la copropiedad solo se tratan cuando resulten
        necesarios para la convivencia o la seguridad, atendiendo su interés
        superior y con autorización de sus representantes legales.
      </p>

      <h2>10. Cambios en esta política</h2>
      <p>
        Podemos actualizar esta política. Cuando el cambio sea sustancial, lo
        avisaremos con al menos quince (15) días de anticipación a través de la
        plataforma o por correo electrónico. La fecha de la última revisión
        aparece al comienzo de este documento.
      </p>
    </LegalPage>
  );
}
