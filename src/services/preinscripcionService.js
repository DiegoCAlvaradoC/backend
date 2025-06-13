// services/preinscripcionService.js
const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Servicio para gestión de preinscripciones
 */
class PreinscripcionService {

    /**
     * Crear una nueva preinscripción completa
     * @param {Object} datosCompletos - Datos de la preinscripción
     * @returns {Object} Preinscripción creada con código de seguimiento
     */
    async crearPreinscripcionCompleta(datosCompletos) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            const {
                // Datos del OCR
                datosOCR,
                // Datos del postulante
                nombre,
                ci,
                nacionalidad,
                ciudad_procedencia,
                colegio_nombre,
                colegio_tipo,
                // Datos adicionales del formulario
                celular,
                email,
                carrera_interes,
                anio_egreso,
                // Contactos de emergencia
                contactos,
                // Documentos entregados
                documentos,
                // Metadata
                usuario_id,
                periodo_id
            } = datosCompletos;

            // 1. Buscar o crear colegio
            let colegio_id = null;
            if (colegio_nombre) {
                colegio_id = await this.buscarOCrearColegio(client, colegio_nombre, colegio_tipo || 'PUBLICO');
            }

            // 2. Crear o actualizar postulante
            const postulante_id = await this.crearOActualizarPostulante(client, {
                nombre,
                ci,
                nacionalidad: nacionalidad || 'Boliviana',
                ciudad_procedencia,
                colegio_id
            });

            // 3. Guardar datos del OCR si existen
            if (datosOCR) {
                await this.guardarDatosOCR(client, postulante_id, datosOCR);
            }

            // 4. Crear la preinscripción
            const preinscripcion_id = await this.crearPreinscripcion(client, {
                postulante_id,
                periodo_id: periodo_id || await this.obtenerPeriodoActivo(client),
                creada_por_id: usuario_id || await this.obtenerUsuarioSistema(client),
                resumen_datos: JSON.stringify({
                    celular,
                    email,
                    carrera_interes,
                    anio_egreso,
                    fecha_registro: new Date().toISOString()
                })
            });

            // 5. Guardar contactos de emergencia
            if (contactos && contactos.length > 0) {
                await this.guardarContactos(client, postulante_id, contactos);
            }

            // 6. Guardar documentos entregados
            if (documentos) {
                await this.guardarDocumentos(client, postulante_id, documentos);
            }

            // 7. Generar código de seguimiento único
            const codigoSeguimiento = this.generarCodigoSeguimiento();

            // 8. Actualizar preinscripción con código de seguimiento
            await client.query(`
                UPDATE preinscripciones 
                SET observaciones = $1
                WHERE id_preinscripcion = $2
            `, [`Código de seguimiento: ${codigoSeguimiento}`, preinscripcion_id]);

            // 9. Registrar en logs
            await this.registrarLog(client, usuario_id, 'CREAR_PREINSCRIPCION', {
                preinscripcion_id,
                postulante_id,
                codigo_seguimiento: codigoSeguimiento
            });

            await client.query('COMMIT');

            // 10. Obtener datos completos de la preinscripción creada
            const preinscripcionCompleta = await this.obtenerPreinscripcionCompleta(preinscripcion_id);

            return {
                success: true,
                data: {
                    ...preinscripcionCompleta,
                    codigo_seguimiento: codigoSeguimiento
                }
            };

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error creando preinscripción:', error);
            throw new Error(`Error al crear preinscripción: ${error.message}`);
        } finally {
            client.release();
        }
    }

    /**
     * Buscar o crear colegio
     */
    async buscarOCrearColegio(client, nombre, tipo = 'PUBLICO') {
        try {
            // Buscar colegio existente
            let result = await client.query(
                'SELECT id_colegio FROM colegios WHERE nombre ILIKE $1',
                [nombre.trim()]
            );

            if (result.rows.length > 0) {
                return result.rows[0].id_colegio;
            }

            // Crear nuevo colegio
            const id_colegio = uuidv4();
            await client.query(`
                INSERT INTO colegios (id_colegio, nombre, tipo)
                VALUES ($1, $2, $3)
            `, [id_colegio, nombre.trim(), tipo]);

            return id_colegio;

        } catch (error) {
            console.error('Error gestionando colegio:', error);
            throw error;
        }
    }

    /**
     * Crear o actualizar postulante
     */
    async crearOActualizarPostulante(client, datosPostulante) {
        try {
            const { nombre, ci, nacionalidad, ciudad_procedencia, colegio_id } = datosPostulante;

            // Verificar si el postulante ya existe
            let result = await client.query(
                'SELECT id_postulante FROM postulantes WHERE ci = $1',
                [ci]
            );

            if (result.rows.length > 0) {
                // Actualizar postulante existente
                const id_postulante = result.rows[0].id_postulante;
                await client.query(`
                    UPDATE postulantes 
                    SET nombre = $1, nacionalidad = $2, ciudad_procedencia = $3, 
                        colegio_id = $4, updated_at = CURRENT_TIMESTAMP
                    WHERE id_postulante = $5
                `, [nombre, nacionalidad, ciudad_procedencia, colegio_id, id_postulante]);

                return id_postulante;
            } else {
                // Crear nuevo postulante
                const id_postulante = uuidv4();
                await client.query(`
                    INSERT INTO postulantes (id_postulante, nombre, ci, nacionalidad, ciudad_procedencia, colegio_id)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [id_postulante, nombre, ci, nacionalidad, ciudad_procedencia, colegio_id]);

                return id_postulante;
            }

        } catch (error) {
            console.error('Error gestionando postulante:', error);
            throw error;
        }
    }

    /**
     * Guardar datos del OCR
     */
    async guardarDatosOCR(client, postulante_id, datosOCR) {
        try {
            // Verificar si ya existen datos OCR para este postulante
            const existeOCR = await client.query(
                'SELECT id FROM datos_ocr WHERE postulante_id = $1',
                [postulante_id]
            );

            const datosExtraidos = JSON.stringify(datosOCR.completeData || datosOCR);
            const confianza = datosOCR.averageConfidence || datosOCR.confidence || 0;

            if (existeOCR.rows.length > 0) {
                // Actualizar datos existentes
                await client.query(`
                    UPDATE datos_ocr 
                    SET datos_extraidos = $1, confianza = $2
                    WHERE postulante_id = $3
                `, [datosExtraidos, confianza, postulante_id]);
            } else {
                // Insertar nuevos datos
                const id = uuidv4();
                await client.query(`
                    INSERT INTO datos_ocr (id, postulante_id, datos_extraidos, confianza)
                    VALUES ($1, $2, $3, $4)
                `, [id, postulante_id, datosExtraidos, confianza]);
            }

        } catch (error) {
            console.error('Error guardando datos OCR:', error);
            throw error;
        }
    }

    /**
     * Crear preinscripción
     */
    async crearPreinscripcion(client, datos) {
        try {
            const { postulante_id, periodo_id, creada_por_id, resumen_datos } = datos;
            const id_preinscripcion = uuidv4();

            await client.query(`
                INSERT INTO preinscripciones 
                (id_preinscripcion, postulante_id, periodo_id, creada_por_id, resumen_datos, estado)
                VALUES ($1, $2, $3, $4, $5, 'PENDIENTE')
            `, [id_preinscripcion, postulante_id, periodo_id, creada_por_id, resumen_datos]);

            return id_preinscripcion;

        } catch (error) {
            console.error('Error creando preinscripción:', error);
            throw error;
        }
    }

    /**
     * Guardar contactos de emergencia
     */
    async guardarContactos(client, postulante_id, contactos) {
        try {
            // Eliminar contactos existentes
            await client.query(
                'DELETE FROM personas_contacto WHERE postulante_id = $1',
                [postulante_id]
            );

            // Insertar nuevos contactos
            for (const contacto of contactos) {
                const id = uuidv4();
                await client.query(`
                    INSERT INTO personas_contacto (id, postulante_id, nombre, parentesco, telefono, correo)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    id,
                    postulante_id,
                    contacto.nombre,
                    contacto.parentesco || contacto.relacion || 'Familiar',
                    contacto.telefono,
                    contacto.correo || null
                ]);
            }

        } catch (error) {
            console.error('Error guardando contactos:', error);
            throw error;
        }
    }

    /**
     * Guardar documentos entregados
     */
    async guardarDocumentos(client, postulante_id, documentos) {
        try {
            // Verificar si ya existen documentos para este postulante
            const existeDoc = await client.query(
                'SELECT id FROM documentos WHERE postulante_id = $1',
                [postulante_id]
            );

            const fechaActual = new Date();
            const docData = {
                fotocopia_ci: documentos.fotocopia_ci || false,
                certificado_nacimiento: documentos.certificado_nacimiento || false,
                fotografias: documentos.fotografias || false,
                titulo_bachiller: documentos.titulo_bachiller || false,
                visa_estudiantil: documentos.visa_estudiantil || false,
                fecha_entrega_ci: documentos.fotocopia_ci ? fechaActual : null,
                fecha_entrega_certificado: documentos.certificado_nacimiento ? fechaActual : null,
                fecha_entrega_fotos: documentos.fotografias ? fechaActual : null,
                fecha_entrega_titulo: documentos.titulo_bachiller ? fechaActual : null,
                fecha_entrega_visa: documentos.visa_estudiantil ? fechaActual : null
            };

            if (existeDoc.rows.length > 0) {
                // Actualizar documentos existentes
                await client.query(`
                    UPDATE documentos 
                    SET fotocopia_ci = $1, certificado_nacimiento = $2, fotografias = $3,
                        titulo_bachiller = $4, visa_estudiantil = $5,
                        fecha_entrega_ci = $6, fecha_entrega_certificado = $7,
                        fecha_entrega_fotos = $8, fecha_entrega_titulo = $9,
                        fecha_entrega_visa = $10, updated_at = CURRENT_TIMESTAMP
                    WHERE postulante_id = $11
                `, [
                    docData.fotocopia_ci, docData.certificado_nacimiento, docData.fotografias,
                    docData.titulo_bachiller, docData.visa_estudiantil,
                    docData.fecha_entrega_ci, docData.fecha_entrega_certificado,
                    docData.fecha_entrega_fotos, docData.fecha_entrega_titulo,
                    docData.fecha_entrega_visa, postulante_id
                ]);
            } else {
                // Insertar nuevos documentos
                const id = uuidv4();
                await client.query(`
                    INSERT INTO documentos 
                    (id, postulante_id, fotocopia_ci, certificado_nacimiento, fotografias,
                     titulo_bachiller, visa_estudiantil, fecha_entrega_ci, fecha_entrega_certificado,
                     fecha_entrega_fotos, fecha_entrega_titulo, fecha_entrega_visa)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                `, [
                    id, postulante_id, docData.fotocopia_ci, docData.certificado_nacimiento, 
                    docData.fotografias, docData.titulo_bachiller, docData.visa_estudiantil,
                    docData.fecha_entrega_ci, docData.fecha_entrega_certificado,
                    docData.fecha_entrega_fotos, docData.fecha_entrega_titulo,
                    docData.fecha_entrega_visa
                ]);
            }

        } catch (error) {
            console.error('Error guardando documentos:', error);
            throw error;
        }
    }

    /**
     * Obtener período activo
     */
    async obtenerPeriodoActivo(client) {
        try {
            const result = await client.query(`
                SELECT id_periodo 
                FROM periodos_inscripcion 
                WHERE estado = true 
                AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
                ORDER BY fecha_inicio DESC
                LIMIT 1
            `);

            if (result.rows.length === 0) {
                throw new Error('No hay período de inscripción activo');
            }

            return result.rows[0].id_periodo;

        } catch (error) {
            console.error('Error obteniendo período activo:', error);
            throw error;
        }
    }

    /**
     * Obtener usuario del sistema
     */
    async obtenerUsuarioSistema(client) {
        try {
            const result = await client.query(`
                SELECT id_usuario 
                FROM usuarios 
                WHERE rol = 'SISTEMA' OR nombre_usuario = 'sistema'
                LIMIT 1
            `);

            if (result.rows.length === 0) {
                // Crear usuario del sistema si no existe
                const id_usuario = uuidv4();
                await client.query(`
                    INSERT INTO usuarios (id_usuario, nombre_usuario, contrasena, rol)
                    VALUES ($1, 'sistema', 'sistema', 'SISTEMA')
                `, [id_usuario]);
                return id_usuario;
            }

            return result.rows[0].id_usuario;

        } catch (error) {
            console.error('Error obteniendo usuario sistema:', error);
            throw error;
        }
    }

    /**
     * Registrar log de actividad
     */
    async registrarLog(client, usuario_id, accion, detalles) {
        try {
            const id_log = uuidv4();
            await client.query(`
                INSERT INTO logs_sistema (id_log, usuario_id, accion, detalles)
                VALUES ($1, $2, $3, $4)
            `, [id_log, usuario_id, accion, JSON.stringify(detalles)]);

        } catch (error) {
            console.error('Error registrando log:', error);
            // No lanzar error para no afectar el flujo principal
        }
    }

    /**
     * Generar código de seguimiento único
     */
    generarCodigoSeguimiento() {
        const fecha = new Date();
        const year = fecha.getFullYear().toString().slice(-2);
        const month = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const day = fecha.getDate().toString().padStart(2, '0');
        const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
        
        return `UCB${year}${month}${day}-${random}`;
    }

    /**
     * Obtener preinscripción completa por ID
     */
    async obtenerPreinscripcionCompleta(id_preinscripcion) {
        try {
            const result = await pool.query(`
                SELECT 
                    p.id_preinscripcion,
                    p.fecha_registro,
                    p.estado,
                    p.resumen_datos,
                    p.observaciones,
                    
                    -- Datos del postulante
                    post.id_postulante,
                    post.nombre,
                    post.ci,
                    post.nacionalidad,
                    post.ciudad_procedencia,
                    
                    -- Datos del colegio
                    c.nombre as colegio_nombre,
                    c.tipo as colegio_tipo,
                    
                    -- Datos del OCR
                    ocr.datos_extraidos,
                    ocr.confianza as ocr_confidence
                    
                FROM preinscripciones p
                JOIN postulantes post ON p.postulante_id = post.id_postulante
                LEFT JOIN colegios c ON post.colegio_id = c.id_colegio
                LEFT JOIN datos_ocr ocr ON post.id_postulante = ocr.postulante_id
                WHERE p.id_preinscripcion = $1
            `, [id_preinscripcion]);

            if (result.rows.length === 0) {
                throw new Error('Preinscripción no encontrada');
            }

            const preinscripcion = result.rows[0];

            // Obtener contactos
            const contactos = await pool.query(`
                SELECT nombre, parentesco, telefono, correo
                FROM personas_contacto
                WHERE postulante_id = $1
                ORDER BY created_at
            `, [preinscripcion.id_postulante]);

            // Obtener documentos
            const documentos = await pool.query(`
                SELECT *
                FROM documentos
                WHERE postulante_id = $1
            `, [preinscripcion.id_postulante]);

            return {
                ...preinscripcion,
                contactos: contactos.rows,
                documentos: documentos.rows[0] || null,
                resumen_datos: preinscripcion.resumen_datos ? JSON.parse(preinscripcion.resumen_datos) : null,
                datos_extraidos: preinscripcion.datos_extraidos ? JSON.parse(preinscripcion.datos_extraidos) : null
            };

        } catch (error) {
            console.error('Error obteniendo preinscripción completa:', error);
            throw error;
        }
    }

    /**
     * Consultar estado de preinscripción por CI
     */
    async consultarEstadoPorCI(ci) {
        try {
            const result = await pool.query(`
                SELECT 
                    p.id_preinscripcion,
                    p.estado,
                    p.fecha_registro,
                    p.observaciones,
                    post.nombre,
                    post.ci,
                    c.nombre as colegio_nombre
                FROM preinscripciones p
                JOIN postulantes post ON p.postulante_id = post.id_postulante
                LEFT JOIN colegios c ON post.colegio_id = c.id_colegio
                WHERE post.ci = $1
                ORDER BY p.fecha_registro DESC
                LIMIT 1
            `, [ci]);

            if (result.rows.length === 0) {
                return {
                    encontrado: false,
                    mensaje: 'No se encontró preinscripción para este CI'
                };
            }

            return {
                encontrado: true,
                data: result.rows[0]
            };

        } catch (error) {
            console.error('Error consultando estado por CI:', error);
            throw error;
        }
    }

    /**
     * Listar preinscripciones con filtros
     */
    async listarPreinscripciones(filtros = {}) {
        try {
            const { estado, fecha_desde, fecha_hasta, ci, nombre, limit = 50, offset = 0 } = filtros;
            
            let whereConditions = [];
            let params = [];
            let paramCount = 0;

            if (estado) {
                paramCount++;
                whereConditions.push(`p.estado = ${paramCount}`);
                params.push(estado);
            }

            if (fecha_desde) {
                paramCount++;
                whereConditions.push(`p.fecha_registro >= ${paramCount}`);
                params.push(fecha_desde);
            }

            if (fecha_hasta) {
                paramCount++;
                whereConditions.push(`p.fecha_registro <= ${paramCount}`);
                params.push(fecha_hasta);
            }

            if (ci) {
                paramCount++;
                whereConditions.push(`post.ci ILIKE ${paramCount}`);
                params.push(`%${ci}%`);
            }

            if (nombre) {
                paramCount++;
                whereConditions.push(`post.nombre ILIKE ${paramCount}`);
                params.push(`%${nombre}%`);
            }

            const whereClause = whereConditions.length > 0 ? 
                `WHERE ${whereConditions.join(' AND ')}` : '';

            const query = `
                SELECT 
                    p.id_preinscripcion,
                    p.fecha_registro,
                    p.estado,
                    post.nombre,
                    post.ci,
                    post.nacionalidad,
                    post.ciudad_procedencia,
                    c.nombre as colegio_nombre,
                    ocr.confianza as ocr_confidence
                FROM preinscripciones p
                JOIN postulantes post ON p.postulante_id = post.id_postulante
                LEFT JOIN colegios c ON post.colegio_id = c.id_colegio
                LEFT JOIN datos_ocr ocr ON post.id_postulante = ocr.postulante_id
                ${whereClause}
                ORDER BY p.fecha_registro DESC
                LIMIT ${paramCount + 1} OFFSET ${paramCount + 2}
            `;

            params.push(limit, offset);

            const result = await pool.query(query, params);

            // Obtener total de registros
            const countQuery = `
                SELECT COUNT(*) as total
                FROM preinscripciones p
                JOIN postulantes post ON p.postulante_id = post.id_postulante
                LEFT JOIN colegios c ON post.colegio_id = c.id_colegio
                ${whereClause}
            `;

            const countResult = await pool.query(countQuery, params.slice(0, -2));

            return {
                data: result.rows,
                total: parseInt(countResult.rows[0].total),
                limit,
                offset
            };

        } catch (error) {
            console.error('Error listando preinscripciones:', error);
            throw error;
        }
    }

    /**
     * Actualizar estado de preinscripción
     */
    async actualizarEstado(id_preinscripcion, estado, observaciones = null) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');

            // Verificar que la preinscripción existe
            const existeResult = await client.query(
                'SELECT id_preinscripcion, estado FROM preinscripciones WHERE id_preinscripcion = $1',
                [id_preinscripcion]
            );

            if (existeResult.rows.length === 0) {
                throw new Error('Preinscripción no encontrada');
            }

            const estadoAnterior = existeResult.rows[0].estado;

            // Actualizar estado y observaciones
            const updateQuery = `
                UPDATE preinscripciones 
                SET estado = $1, 
                    observaciones = COALESCE($2, observaciones),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id_preinscripcion = $3
                RETURNING *
            `;

            const result = await client.query(updateQuery, [estado, observaciones, id_preinscripcion]);

            // Registrar el cambio en logs
            await this.registrarLog(client, null, 'CAMBIO_ESTADO', {
                preinscripcion_id: id_preinscripcion,
                estado_anterior: estadoAnterior,
                estado_nuevo: estado,
                observaciones
            });

            await client.query('COMMIT');

            return result.rows[0];

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Error actualizando estado:', error);
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Obtener estadísticas de preinscripciones
     */
    async obtenerEstadisticas(filtros = {}) {
        try {
            const { fecha_desde, fecha_hasta } = filtros;
            
            let whereClause = '';
            let params = [];
            
            if (fecha_desde || fecha_hasta) {
                const conditions = [];
                let paramCount = 0;
                
                if (fecha_desde) {
                    paramCount++;
                    conditions.push(`p.fecha_registro >= ${paramCount}`);
                    params.push(fecha_desde);
                }
                
                if (fecha_hasta) {
                    paramCount++;
                    conditions.push(`p.fecha_registro <= ${paramCount}`);
                    params.push(fecha_hasta);
                }
                
                whereClause = `WHERE ${conditions.join(' AND ')}`;
            }

            // Estadísticas por estado
            const estadoQuery = `
                SELECT 
                    estado,
                    COUNT(*) as cantidad
                FROM preinscripciones p
                ${whereClause}
                GROUP BY estado
                ORDER BY cantidad DESC
            `;

            // Estadísticas por colegio
            const colegioQuery = `
                SELECT 
                    c.nombre as colegio,
                    c.tipo,
                    COUNT(*) as cantidad
                FROM preinscripciones p
                JOIN postulantes post ON p.postulante_id = post.id_postulante
                LEFT JOIN colegios c ON post.colegio_id = c.id_colegio
                ${whereClause}
                GROUP BY c.nombre, c.tipo
                ORDER BY cantidad DESC
                LIMIT 10
            `;

            // Estadísticas por ciudad
            const ciudadQuery = `
                SELECT 
                    post.ciudad_procedencia as ciudad,
                    COUNT(*) as cantidad
                FROM preinscripciones p
                JOIN postulantes post ON p.postulante_id = post.id_postulante
                ${whereClause}
                AND post.ciudad_procedencia IS NOT NULL
                GROUP BY post.ciudad_procedencia
                ORDER BY cantidad DESC
                LIMIT 10
            `;

            // Ejecutar todas las consultas
            const [estadoResult, colegioResult, ciudadResult, ocrResult] = await Promise.all([
                pool.query(estadoQuery, params),
                pool.query(colegioQuery, params),
                pool.query(ciudadQuery, params),
                pool.query(ocrQuery, params)
            ]);

            // Estadísticas generales
            const totalQuery = `
                SELECT COUNT(*) as total
                FROM preinscripciones p
                ${whereClause}
            `;
            const totalResult = await pool.query(totalQuery, params);

            return {
                resumen: {
                    total_preinscripciones: parseInt(totalResult.rows[0].total),
                    periodo: {
                        fecha_desde: fecha_desde || 'No especificada',
                        fecha_hasta: fecha_hasta || 'No especificada'
                    }
                },
                por_estado: estadoResult.rows,
                por_colegio: colegioResult.rows,
                por_ciudad: ciudadResult.rows,
                calidad_ocr: ocrResult.rows[0] || {
                    confianza_promedio: 0,
                    alta_confianza: 0,
                    media_confianza: 0,
                    baja_confianza: 0,
                    total_con_ocr: 0
                }
            };

        } catch (error) {
            console.error('Error obteniendo estadísticas:', error);
            throw error;
        }
    }

    /**
     * Obtener período activo con información completa
     */
    async obtenerPeriodoActivo(client = null) {
        try {
            const connection = client || pool;
            
            const result = await connection.query(`
                SELECT 
                    id_periodo,
                    fecha_inicio,
                    fecha_fin,
                    estado,
                    created_at
                FROM periodos_inscripcion 
                WHERE estado = true 
                AND CURRENT_DATE BETWEEN fecha_inicio AND fecha_fin
                ORDER BY fecha_inicio DESC
                LIMIT 1
            `);

            if (result.rows.length === 0) {
                // Buscar el próximo período
                const proximoResult = await connection.query(`
                    SELECT 
                        id_periodo,
                        fecha_inicio,
                        fecha_fin,
                        estado
                    FROM periodos_inscripcion 
                    WHERE estado = true 
                    AND fecha_inicio > CURRENT_DATE
                    ORDER BY fecha_inicio ASC
                    LIMIT 1
                `);

                if (proximoResult.rows.length > 0) {
                    return {
                        activo: false,
                        proximo: proximoResult.rows[0],
                        mensaje: 'No hay período activo, pero hay uno próximo'
                    };
                }

                throw new Error('No hay período de inscripción activo');
            }

            return {
                activo: true,
                periodo: result.rows[0],
                mensaje: 'Período de inscripción activo'
            };

        } catch (error) {
            console.error('Error obteniendo período activo:', error);
            throw error;
        }
    }

    /**
     * Health check del servicio
     */
    async healthCheck() {
        try {
            // Verificar conexión a base de datos
            const dbResult = await pool.query('SELECT NOW() as timestamp, version() as version');
            
            // Verificar tablas principales
            const tablesResult = await pool.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name IN ('preinscripciones', 'postulantes', 'colegios', 'datos_ocr', 'documentos', 'personas_contacto')
                ORDER BY table_name
            `);

            // Contar registros básicos
            const countResult = await pool.query(`
                SELECT 
                    (SELECT COUNT(*) FROM preinscripciones) as total_preinscripciones,
                    (SELECT COUNT(*) FROM postulantes) as total_postulantes,
                    (SELECT COUNT(*) FROM colegios) as total_colegios
            `);

            // Verificar período activo
            let periodoActivo;
            try {
                periodoActivo = await this.obtenerPeriodoActivo();
            } catch (error) {
                periodoActivo = { activo: false, error: error.message };
            }

            return {
                database: {
                    connected: true,
                    timestamp: dbResult.rows[0].timestamp,
                    version: dbResult.rows[0].version.split(' ')[0] + ' ' + dbResult.rows[0].version.split(' ')[1]
                },
                tables: {
                    found: tablesResult.rows.map(row => row.table_name),
                    expected: ['colegios', 'datos_ocr', 'documentos', 'personas_contacto', 'postulantes', 'preinscripciones'],
                    all_present: tablesResult.rows.length === 6
                },
                data: {
                    total_preinscripciones: parseInt(countResult.rows[0].total_preinscripciones),
                    total_postulantes: parseInt(countResult.rows[0].total_postulantes),
                    total_colegios: parseInt(countResult.rows[0].total_colegios)
                },
                periodo_inscripcion: periodoActivo,
                status: 'healthy'
            };

        } catch (error) {
            console.error('Error en health check:', error);
            return {
                database: {
                    connected: false,
                    error: error.message
                },
                status: 'unhealthy'
            };
        }
    }
}

module.exports = new PreinscripcionService();