# AEXOS

Agentic eXecution & Orchestration System, de Cyryx Labs. Instrucciones de agentes,
flujos de desarrollo y herramientas CLI dentro del proyecto para trabajar con IA.

[English](README.md) · [Português](README.pt-BR.md) · **Español**

## Empieza aquí

Necesitas Node.js 18 o posterior, npm 9 o posterior, acceso a internet para
descargar el paquete y un entorno de desarrollo con IA de tu elección. Selecciona
solo el entorno que utilizas; las demás integraciones son opcionales. El acceso
al repositorio GitHub, una instalación global y las extensiones de pago no son
requisitos para empezar con Core.

Comprueba la versión pública:

```bash
npm view @aexos/core version
npx @aexos/core --version
```

Crea un proyecto:

```bash
npx @aexos/core init my-project
cd my-project
npx @aexos/core doctor
```

Para un proyecto existente, ejecuta este comando dentro de su carpeta:

```bash
npx @aexos/core install
```

`init` requiere el nombre de una carpeta; `install` utiliza la carpeta actual.
Ambos usan el mismo paquete npm. Después de instalar, vuelve a abrir tu entorno
de IA en el proyecto. Activa un agente Core desde la interfaz de agentes o skills
del entorno y solicita:

```text
@aexos-master
*help
```

El objetivo es recibir la presentación del agente y sus comandos disponibles.
Copiar los archivos no demuestra que el entorno de IA los haya cargado; la
activación es un paso independiente. Consulta la [guía de IDEs](docs/ide-integration.md).

## Versión pública y candidato local

Verificado el **2026-09-08**: la etiqueta `latest` de npm apuntaba a **5.3.0**.
Las correcciones de instalación están en revisión en el [PR #4](https://github.com/CyryxLabs/aexos-engine/pull/4).
Este cambio de documentación no publica una versión ni cambia la versión del paquete.
El desarrollo más amplio de la versión 6.x es independiente y no se instala mediante npm.

En la verificación limpia del paquete público 5.3.0, `init` terminó con código 0
e instaló 12 archivos de agentes Core. `doctor` terminó con código 1 y fallos en
`rules-files`, `claude-md`, `npm-packages` y `hooks-claude-count`; el banner también
indicó incorrectamente que faltaban agentes. La ayuda de `init` sigue mostrando
el antiguo comando de GitHub. Estos defectos observados están corregidos en el
candidato local, cuyas verificaciones de inicialización predeterminada pasaron,
pero la versión npm corregida aún no se ha publicado. Ese resultado de Doctor,
por sí solo, no demuestra que falten todos los archivos. Las correcciones locales
todavía no están disponibles mediante `npx @aexos/core`.

## Core y extensiones de pago opcionales

Core sigue siendo gratuito para empezar. La decisión de distribución aceptada
mantiene el framework, los 12 agentes de desarrollo y el squad Security dentro
del paquete público Core. Los squads adicionales de pago se distribuyen de forma
privada, tras autenticar el derecho de acceso y verificar el paquete firmado.
Este es el límite de contenido previsto para la versión 6.x. Esta rama de
documentación conserva la lista de archivos del paquete 5.3.0; no implementa
ese límite.

La entrega de pago sigue en certificación de extremo a extremo. Las verificaciones
locales no certifican un recorrido real de checkout, descarga e instalación de
pago. Cada copia publicada sigue sujeta a la licencia que la acompaña. Esta
documentación no concede nuevos derechos ni impone restricciones retroactivas.

## Próximos pasos

- [Primeros pasos](docs/getting-started.md)
- [Guía de instalación](docs/installation/README.md)
- [Resolución de problemas](docs/guides/installation-troubleshooting.md)
- [Decisión de distribución](docs/framework/epics/aexos-evolution/adr/ADR-AEX-011-CORE-FREE-PAID-SQUAD-DISTRIBUTION.md)
- [Referencia completa del checkout, en inglés](README.md#contents)

Esta es la entrada principal en español; las guías detalladas pueden seguir en
inglés. La referencia del checkout describe el código actual. Consulta la ayuda
de la versión instalada antes de utilizar comandos adicionales.
