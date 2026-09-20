# Fénix

Fénix es un proyecto independiente de IA experimental con arquitectura centrada en memoria.

## Estado
- Fénix v0.1.0
- Supabase conectado
- Memoria persistente
- Conversaciones persistentes
- Estado del modelo
- RLS habilitado
- Autenticación anónima para prototipo

## Arquitectura
El frontend usa Supabase como capa persistente. El núcleo actual recupera recuerdos relevantes por coincidencia contextual y evita fingir que un generador de texto simple es un modelo entrenado.

## Configuración
En Supabase activa:
Authentication → Providers → Anonymous Sign-Ins

Después abre index.html.

## Próxima etapa
Conectar un modelo generativo real al núcleo de Fénix, manteniendo la memoria como contexto recuperable y evitando exponer claves secretas en el navegador.
