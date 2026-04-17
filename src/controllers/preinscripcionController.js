// controllers/preinscripcionController.js
const preinscripcionService = require('../services/preinscripcionService');
const { validationResult } = require('express-validator');

/**
 * Controlador para gestión de preinscripciones
 */
class PreinscripcionController {
    
    /**
     * POST /api/preinscripciones
     */
    async crear(req, res) {
        try {
            // Validar errores de entrada
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Datos de entrada inválidos',
                    details: errors.array()
                });
            }

            console.log('📝 Creando preinscripción:', {
                ci: req.body.ci,
                nombre: req.body.nombre,
                hasOCR: !!req.body.datosOCR
            });

            // Preparar datos para el servicio
            const datosCompletos = {
                // Datos básicos del postulante
                nombre: req.body.nombre,
                ci: req.body.ci,
                nacionalidad: req.body.nacionalidad || 'Boliviana',
                ciudad_procedencia: req.body.ciudad_procedencia,
                
                // Datos del colegio
                colegio_egreso: req.body.colegio_egreso,
                colegio_tipo: req.body.colegio_tipo || 'PUBLICO',
                
                // Datos adicionales del formulario
                celular: req.body.celular,
                email: req.body.email,
                carrera_interes: req.body.carrera_interes,
                anio_egreso: req.body.anio_egreso,
                
                // Datos del OCR (si existen)
                datosOCR: req.body.datosOCR,
                
                // Contactos de emergencia
                contactos: req.body.contactos || [],
                
                // Documentos entregados
                documentos: req.body.documentos || {},
                
                // Metadata
                usuario_id: req.body.usuario_id || req.user?.id,
                periodo_id: req.body.periodo_id,
                ip_address: req.ip,
                user_agent: req.get('User-Agent')
            };

            // Crear preinscripción
            const resultado = await preinscripcionService.crearPreinscripcionCompleta(datosCompletos);

            console.log('✅ Preinscripción creada exitosamente:', {
                id: resultado.data.id_preinscripcion,
                codigo: resultado.data.codigo_seguimiento
            });

            res.status(201).json({
                success: true,
                message: 'Preinscripción creada exitosamente',
                data: {
                    id_preinscripcion: resultado.data.id_preinscripcion,
                    codigo_seguimiento: resultado.data.codigo_seguimiento,
                    estado: resultado.data.estado,
                    fecha_registro: resultado.data.fecha_registro,
                    postulante: {
                        nombre: resultado.data.nombre,
                        ci: resultado.data.ci,
                        nacionalidad: resultado.data.nacionalidad
                    }
                }
            });

        } catch (error) {
            console.error('❌ Error en crear preinscripción:', error);
            
            // Manejar errores específicos
            if (error.message.includes('período de inscripción')) {
                return res.status(400).json({
                    success: false,
                    error: 'Período de inscripción no activo',
                    message: 'Actualmente no hay un período de inscripción activo'
                });
            }

            if (error.message.includes('ya existe')) {
                return res.status(409).json({
                    success: false,
                    error: 'Postulante ya registrado',
                    message: 'Ya existe una preinscripción para este CI'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                message: process.env.NODE_ENV === 'development' ? error.message : 'Error al procesar la solicitud'
            });
        }
    }

    /**
     * Consultar estado de preinscripción por CI
     * GET /api/preinscripciones/estado/:ci
     */
    async consultarEstado(req, res) {
        try {
            const { ci } = req.params;

            if (!ci || ci.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'CI inválido',
                    message: 'El CI debe tener al menos 6 caracteres'
                });
            }

            console.log('🔍 Consultando estado para CI:', ci);

            const resultado = await preinscripcionService.consultarEstadoPorCI(ci);

            if (!resultado.encontrado) {
                return res.status(404).json({
                    success: false,
                    encontrado: false,
                    message: 'No se encontró preinscripción para este CI'
                });
            }

            res.json({
                success: true,
                encontrado: true,
                data: resultado.data
            });

        } catch (error) {
            console.error('❌ Error consultando estado:', error);
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                message: 'Error al consultar el estado de la preinscripción'
            });
        }
    }

    /**
     * Obtener preinscripción completa por ID
     * GET /api/preinscripciones/:id
     */
    async obtenerPorId(req, res) {
        try {
            const { id } = req.params;

            if (!id) {
                return res.status(400).json({
                    success: false,
                    error: 'ID requerido',
                    message: 'Debe proporcionar un ID de preinscripción'
                });
            }

            console.log('🔍 Obteniendo preinscripción:', id);

            const preinscripcion = await preinscripcionService.obtenerPreinscripcionCompleta(id);

            res.json({
                success: true,
                data: preinscripcion
            });

        } catch (error) {
            console.error('❌ Error obteniendo preinscripción:', error);
            
            if (error.message.includes('no encontrada')) {
                return res.status(404).json({
                    success: false,
                    error: 'Preinscripción no encontrada',
                    message: 'No existe una preinscripción con el ID proporcionado'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                message: 'Error al obtener la preinscripción'
            });
        }
    }

    /**
     * Listar preinscripciones con filtros
     * GET /api/preinscripciones
     */
    async listar(req, res) {
        try {
            const {
                estado,
                fecha_desde,
                fecha_hasta,
                ci,
                nombre,
                page = 1,
                limit = 20
            } = req.query;

            // Validar parámetros de paginación
            const pageNum = Math.max(1, parseInt(page));
            const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
            const offset = (pageNum - 1) * limitNum;

            const filtros = {
                estado,
                fecha_desde,
                fecha_hasta,
                ci,
                nombre,
                limit: limitNum,
                offset
            };

            console.log('📋 Listando preinscripciones:', filtros);

            const resultado = await preinscripcionService.listarPreinscripciones(filtros);

            res.json({
                success: true,
                data: resultado.data,
                pagination: {
                    total: resultado.total,
                    page: pageNum,
                    limit: limitNum,
                    totalPages: Math.ceil(resultado.total / limitNum),
                    hasNext: pageNum * limitNum < resultado.total,
                    hasPrev: pageNum > 1
                }
            });

        } catch (error) {
            console.error('❌ Error listando preinscripciones:', error);
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                message: 'Error al obtener la lista de preinscripciones'
            });
        }
    }

    /**
     * Actualizar estado de preinscripción
     * PATCH /api/preinscripciones/:id/estado
     */
    async actualizarEstado(req, res) {
        try {
            const { id } = req.params;
            const { estado, observaciones } = req.body;

            if (!id || !estado) {
                return res.status(400).json({
                    success: false,
                    error: 'Datos requeridos',
                    message: 'ID y estado son obligatorios'
                });
            }

            // --- INICIO DE LA MODIFICACIÓN ---

            // Validar estados permitidos (Sincronizado con el CHECK de la BD)
            const estadosValidos = [
                'PENDIENTE',
                'APROBADA',
                'OBSERVADA',
                'RECHAZADA',
                'DOCUMENTOS'
            ];

            if (!estadosValidos.includes(estado.toUpperCase())) {
                return res.status(400).json({
                    success: false,
                    error: 'Estado inválido',
                    message: `Estado debe ser uno de: ${estadosValidos.join(', ')}`
                });
            }

            // --- FIN DE LA MODIFICACIÓN ---


            console.log('📝 Actualizando estado de preinscripción:', { id, estado });

            // Aseguramos que se envíe en mayúsculas al servicio
            const resultado = await preinscripcionService.actualizarEstado(id, estado.toUpperCase(), observaciones);

            res.json({
                success: true,
                message: 'Estado actualizado exitosamente',
                data: resultado
            });

        } catch (error) {
            console.error('❌ Error actualizando estado:', error);

            // Este chequeo de 'no encontrada' es propenso a errores si el servicio
            // cambia el mensaje. Sería mejor un código de error.
            if (error.message.includes('no encontrada') || error.code === 'NOT_FOUND') {
                return res.status(404).json({
                    success: false,
                    error: 'Preinscripción no encontrada',
                    message: 'No existe una preinscripción con el ID proporcionado'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                message: 'Error al actualizar el estado'
            });
        }
    }

    /**
     * Obtener estadísticas de preinscripciones
     * GET /api/preinscripciones/estadisticas
     */
    async obtenerEstadisticas(req, res) {
        try {
            const { fecha_desde, fecha_hasta } = req.query;

            console.log('📊 Obteniendo estadísticas de preinscripciones');

            const estadisticas = await preinscripcionService.obtenerEstadisticas({
                fecha_desde,
                fecha_hasta
            });

            res.json({
                success: true,
                data: estadisticas
            });

        } catch (error) {
            console.error('❌ Error obteniendo estadísticas:', error);
            res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                message: 'Error al obtener las estadísticas'
            });
        }
    }

    /**
     * Verificar período de inscripción activo
     * GET /api/preinscripciones/periodo/activo
     */
    async verificarPeriodoActivo(req, res) {
        try {
            console.log('🕐 Verificando período de inscripción activo');

            const periodoActivo = await preinscripcionService.obtenerPeriodoActivo();

            res.json({
                success: true,
                activo: !!periodoActivo,
                data: periodoActivo
            });

        } catch (error) {
            console.error('❌ Error verificando período:', error);
            
            if (error.message.includes('No hay período')) {
                return res.json({
                    success: true,
                    activo: false,
                    message: 'No hay período de inscripción activo'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                message: 'Error al verificar el período de inscripción'
            });
        }
    }

    /**
     * Health check específico para preinscripciones
     * GET /api/preinscripciones/health
     */
    async healthCheck(req, res) {
        try {
            const health = await preinscripcionService.healthCheck();
            
            res.json({
                success: true,
                service: 'preinscripciones',
                status: 'healthy',
                timestamp: new Date().toISOString(),
                data: health
            });

        } catch (error) {
            console.error('❌ Error en health check:', error);
            res.status(503).json({
                success: false,
                service: 'preinscripciones',
                status: 'unhealthy',
                timestamp: new Date().toISOString(),
                error: error.message
            });
        }
    }
    /**
     * Actualizar documentos de una preinscripción
     * PATCH /api/preinscripciones/:id/documentos
     */
    async actualizarDocumentos(req, res) {
        try {
            const { id } = req.params;
            const { documentos } = req.body; // { fotocopia_ci, certificado_nacimiento, fotografias, titulo_bachiller }

            if (!id || !documentos) {
                return res.status(400).json({
                    success: false,
                    error: 'Datos requeridos',
                    message: 'ID y documentos son obligatorios'
                });
            }

            console.log('📋 Actualizando documentos de preinscripción:', { id, documentos });

            const resultado = await preinscripcionService.actualizarDocumentos(id, documentos);

            res.json({
                success: true,
                message: 'Documentos actualizados correctamente',
                data: resultado
            });

        } catch (error) {
            console.error('❌ Error actualizando documentos:', error);

            if (error.message.includes('no encontrada')) {
                return res.status(404).json({
                    success: false,
                    error: 'Preinscripción no encontrada'
                });
            }

            res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                message: 'Error al actualizar los documentos'
            });
        }
    }
}

module.exports = new PreinscripcionController();