// services/preinscripcionService.js
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

/**
 * Servicio para gestión de preinscripciones
 */
class PreinscripcionService {

    /**
     * Crear una nueva preinscripción completa
     */
    async crearPreinscripcionCompleta(datosCompletos) {
        const client = await pool.connect();

        try {
            console.log('🚀 Iniciando creación de preinscripción...');
            await client.query('BEGIN');

            const {
                datosOCR,
                nombre,
                ci,
                nacionalidad,
                ciudad_procedencia,
                colegio_egreso,
                colegio_tipo,
                celular,
                email,
                carrera_interes,
                anio_egreso,
                contactos,
                documentos,
                usuario_id,
                periodo_id
            } = datosCompletos;

            console.log('📝 Datos recibidos en servicio:', {
                nombre,
                ci,
                colegio_egreso,
                contactos: contactos?.length,
                periodo_id
            });

            // 1. Buscar o crear colegio
            console.log('🏫 Paso 1: Gestionando colegio...');
            let colegio_id = null;
            if (colegio_egreso) {
                try {
                    colegio_id = await this.buscarOCrearColegio(client, colegio_egreso, colegio_tipo || 'PUBLICO');
                    console.log('✅ Colegio gestionado:', colegio_id);
                } catch (error) {
                    console.error('❌ Error en gestión de colegio:', error);
                    throw new Error(`Error gestionando colegio: ${error.message}`);
                }
            }

            // 2. Crear o actualizar postulante
            console.log('👤 Paso 2: Gestionando postulante...');
            let postulante_id;
            try {
                postulante_id = await this.crearOActualizarPostulante(client, {
                    nombre,
                    ci,
                    nacionalidad: nacionalidad || 'Boliviana',
                    ciudad_procedencia,
                    colegio_id
                });
                console.log('✅ Postulante gestionado:', postulante_id);
            } catch (error) {
                console.error('❌ Error en gestión de postulante:', error);
                throw new Error(`Error gestionando postulante: ${error.message}`);
            }

            // 3. Guardar datos del OCR si existen
            if (datosOCR) {
                console.log('🔍 Paso 3: Guardando datos OCR...');
                try {
                    await this.guardarDatosOCR(client, postulante_id, datosOCR);
                    console.log('✅ Datos OCR guardados');
                } catch (error) {
                    console.error('❌ Error guardando OCR:', error);
                    throw new Error(`Error guardando datos OCR: ${error.message}`);
                }
            }

            // 4. Obtener período activo
            console.log('📅 Paso 4: Obteniendo período activo...');
            let periodo_activo_id;
            try {
                periodo_activo_id = periodo_id || await this.obtenerPeriodoActivoSeguro(client);
                console.log('✅ Período obtenido:', periodo_activo_id);
            } catch (error) {
                console.error('❌ Error obteniendo período:', error);
                throw new Error(`Error obteniendo período: ${error.message}`);
            }

            // 5. Obtener usuario del sistema
            console.log('👨‍💼 Paso 5: Obteniendo usuario del sistema...');
            let usuario_sistema_id;
            try {
                usuario_sistema_id = usuario_id || await this.obtenerUsuarioSistema(client);
                console.log('✅ Usuario obtenido:', usuario_sistema_id);
            } catch (error) {
                console.error('❌ Error obteniendo usuario:', error);
                throw new Error(`Error obteniendo usuario del sistema: ${error.message}`);
            }

            console.log('🔍 IDs obtenidos:', {
                periodo_activo_id,
                usuario_sistema_id,
                postulante_id
            });

            // 6. Crear la preinscripción
            console.log('📋 Paso 6: Creando preinscripción...');
            let preinscripcion_id;
            try {
                preinscripcion_id = await this.crearPreinscripcion(client, {
                    postulante_id,
                    periodo_id: periodo_activo_id,
                    creada_por_id: usuario_sistema_id,
                    resumen_datos: JSON.stringify({
                        celular,
                        email,
                        carrera_interes,
                        anio_egreso,
                        fecha_registro: new Date().toISOString()
                    })
                });
                console.log('✅ Preinscripción creada:', preinscripcion_id);
            } catch (error) {
                console.error('❌ Error creando preinscripción:', error);
                throw new Error(`Error creando preinscripción: ${error.message}`);
            }

            // 7. Guardar contactos de emergencia
            if (contactos && contactos.length > 0) {
                console.log('📞 Paso 7: Guardando contactos...');
                try {
                    await this.guardarContactos(client, postulante_id, contactos);
                    console.log('✅ Contactos guardados');
                } catch (error) {
                    console.error('❌ Error guardando contactos:', error);
                    throw new Error(`Error guardando contactos: ${error.message}`);
                }
            }

            // 8. Guardar documentos entregados
            if (documentos) {
                console.log('📄 Paso 8: Guardando documentos...');
                try {
                    await this.guardarDocumentos(client, postulante_id, documentos);
                    console.log('✅ Documentos guardados');
                } catch (error) {
                    console.error('❌ Error guardando documentos:', error);
                    throw new Error(`Error guardando documentos: ${error.message}`);
                }
            }

            // 9. Generar código de seguimiento único
            console.log('🔢 Paso 9: Generando código...');
            const codigoSeguimiento = this.generarCodigoSeguimiento();
            console.log('✅ Código generado:', codigoSeguimiento);

            // 10. Actualizar preinscripción con código de seguimiento
            console.log('📝 Paso 10: Actualizando con código...');
            try {
                await client.query(`
                    UPDATE preinscripciones 
                    SET observaciones = $1
                    WHERE id_preinscripcion = $2
                `, [`Código de seguimiento: ${codigoSeguimiento}`, preinscripcion_id]);
                console.log('✅ Código actualizado');
            } catch (error) {
                console.error('❌ Error actualizando código:', error);
                throw new Error(`Error actualizando código: ${error.message}`);
            }

            console.log('✅ Haciendo COMMIT...');
            await client.query('COMMIT');

            console.log('🎉 Preinscripción completada exitosamente');
            return {
                success: true,
                data: {
                    id_preinscripcion: preinscripcion_id,
                    codigo_seguimiento: codigoSeguimiento,
                    nombre,
                    ci,
                    estado: 'PENDIENTE'
                }
            };

        } catch (error) {
            console.error('❌ Error en el proceso, haciendo ROLLBACK:', error);
            try {
                await client.query('ROLLBACK');
                console.log('✅ ROLLBACK completado');
            } catch (rollbackError) {
                console.error('❌ Error en ROLLBACK:', rollbackError);
            }

            throw new Error(`Error al crear preinscripción: ${error.message}`);
        } finally {
            client.release();
            console.log('🔓 Conexión liberada');
        }
    }

    /**
     * Listar preinscripciones con filtros y paginación
     */
    async listarPreinscripciones(filtros = {}) {
        try {
            const {
                estado,
                fecha_desde,
                fecha_hasta,
                ci,
                nombre,
                limit = 20,
                offset = 0
            } = filtros;

            console.log('📋 Ejecutando listarPreinscripciones con filtros:', filtros);

            // Construir WHERE dinámicamente
            const conditions = [];
            const params = [];
            let paramCount = 0;

            if (estado) {
                paramCount++;
                conditions.push(`p.estado = $${paramCount}`);
                params.push(estado);
            }

            if (fecha_desde) {
                paramCount++;
                conditions.push(`p.fecha_registro >= $${paramCount}`);
                params.push(fecha_desde);
            }

            if (fecha_hasta) {
                paramCount++;
                conditions.push(`p.fecha_registro <= $${paramCount}`);
                params.push(fecha_hasta);
            }

            if (ci) {
                paramCount++;
                conditions.push(`post.ci ILIKE $${paramCount}`);
                params.push(`%${ci}%`);
            }

            if (nombre) {
                paramCount++;
                conditions.push(`post.nombre ILIKE $${paramCount}`);
                params.push(`%${nombre}%`);
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            console.log('🔍 WHERE clause:', whereClause);
            console.log('📊 Params:', params);

            // Consulta principal con JOIN a postulantes, colegios y carreras
            const query = `
            SELECT 
                p.id_preinscripcion,
                p.postulante_id,
                p.periodo_id,
                p.estado,
                p.fecha_registro,
                p.resumen_datos,
                p.observaciones,
                
                -- Datos del Postulante
                post.nombre,
                post.ci,
                post.nacionalidad,
                post.ciudad_procedencia,
                post.email,         -- <<< NUEVO
                post.telefono,      -- <<< NUEVO
                
                -- Datos del Colegio
                c.nombre as colegio_nombre,
                c.tipo as colegio_tipo,
                
                -- Datos de la Carrera
                car.nombre_carrera  -- <<< NUEVO
                
            FROM preinscripciones p
            JOIN postulantes post ON p.postulante_id = post.id_postulante
            LEFT JOIN colegios c ON post.colegio_id = c.id_colegio
            LEFT JOIN carreras car ON post.id_carrera = car.id_carrera -- <<< NUEVO JOIN
            ${whereClause}
            ORDER BY p.fecha_registro DESC
            LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
        `;

            params.push(limit, offset);

            // Consulta para contar total de registros
            // No es necesario añadir el JOIN a carreras aquí, no afecta el conteo
            const countQuery = `
            SELECT COUNT(*) as total
            FROM preinscripciones p
            JOIN postulantes post ON p.postulante_id = post.id_postulante
            ${whereClause}
        `;

            const countParams = params.slice(0, paramCount);

            console.log('🚀 Ejecutando consultas...');

            // Ejecutar ambas consultas
            const [dataResult, countResult] = await Promise.all([
                pool.query(query, params),
                pool.query(countQuery, countParams)
            ]);

            console.log('✅ Resultados obtenidos:', {
                registros: dataResult.rows.length,
                total: countResult.rows[0].total
            });

            // Procesar resumen_datos si existe
            const preinscripciones = dataResult.rows.map(row => {
                let resumenDatos = {};
                if (row.resumen_datos) {
                    try {
                        resumenDatos = typeof row.resumen_datos === 'string'
                            ? JSON.parse(row.resumen_datos)
                            : row.resumen_datos;
                    } catch (error) {
                        console.error('Error parseando resumen_datos:', error);
                    }
                }

                return {
                    id_preinscripcion: row.id_preinscripcion,
                    postulante: {
                        id: row.postulante_id,
                        nombre: row.nombre,
                        ci: row.ci,
                        nacionalidad: row.nacionalidad,
                        ciudad_procedencia: row.ciudad_procedencia,
                        email: row.email,     // <<< NUEVO
                        telefono: row.telefono  // <<< NUEVO
                    },
                    colegio: row.colegio_nombre ? {
                        nombre: row.colegio_nombre,
                        tipo: row.colegio_tipo
                    } : null,
                    carrera: row.nombre_carrera ? { // <<< NUEVO
                        nombre: row.nombre_carrera
                    } : null,
                    periodo_id: row.periodo_id,
                    estado: row.estado,
                    fecha_registro: row.fecha_registro,
                    observaciones: row.observaciones,
                    ...resumenDatos
                };
            });

            return {
                data: preinscripciones,
                total: parseInt(countResult.rows[0].total)
            };

        } catch (error) {
            console.error('❌ Error en listarPreinscripciones:', error);
            throw error;
        }
    }
    /**
     * Actualiza el estado y observaciones de una preinscripción por su ID
     * @param {string} id - El UUID de la preinscripción
     * @param {string} estado - El nuevo estado (ej. 'APROBADA', 'RECHAZADA')
     * @param {string} observaciones - Las observaciones opcionales
     * @returns {Promise<object | null>} La preinscripción actualizada o null si no se encuentra
     */
    async actualizarEstado(id, estado, observaciones) {
        try {
            console.log(`[Service] Actualizando preinscripción ${id}:`, { estado, observaciones });

            const query = `
      UPDATE preinscripciones
      SET 
        estado = $1,
        observaciones = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE 
        id_preinscripcion = $3
      RETURNING *;
    `;

            // El orden de parámetros es importante: $1, $2, $3
            const params = [estado, observaciones, id];

            const result = await pool.query(query, params);

            if (result.rows.length === 0) {
                console.warn(`[Service] No se encontró la preinscripción con ID ${id}`);
                return null;
            }

            console.log(`[Service] Preinscripción actualizada con éxito.`);
            return result.rows[0];

        } catch (error) {
            console.error('❌ Error en service.actualizarEstado:', error);
            throw error; // Lanza el error para que el controlador lo atrape
        }
    }
    /**
     * Obtener período activo
     */
    async obtenerPeriodoActivoSeguro(client) {
        try {
            console.log('📅 Buscando período de inscripción...');

            let result = await client.query(`
                SELECT id_periodo, fecha_inicio, fecha_fin, estado
                FROM periodos_inscripcion 
                WHERE estado = true
                ORDER BY fecha_inicio DESC
                LIMIT 1
            `);

            if (result.rows.length > 0) {
                console.log('✅ Período activo encontrado:', {
                    id: result.rows[0].id_periodo,
                    fechas: `${result.rows[0].fecha_inicio} - ${result.rows[0].fecha_fin}`,
                    estado: result.rows[0].estado
                });
                return result.rows[0].id_periodo;
            }

            result = await client.query(`
                SELECT id_periodo, fecha_inicio, fecha_fin, estado
                FROM periodos_inscripcion 
                ORDER BY fecha_inicio DESC
                LIMIT 1
            `);

            if (result.rows.length > 0) {
                console.log('✅ Período encontrado (no activo):', {
                    id: result.rows[0].id_periodo,
                    fechas: `${result.rows[0].fecha_inicio} - ${result.rows[0].fecha_fin}`,
                    estado: result.rows[0].estado
                });
                return result.rows[0].id_periodo;
            }

            throw new Error('No hay períodos de inscripción. Debe crearse uno en la base de datos.');

        } catch (error) {
            console.error('❌ Error obteniendo período:', error);
            throw error;
        }
    }

    async obtenerUsuarioSistema(client) {
        try {
            console.log('🔍 Buscando usuario del sistema para preinscripciones web...');

            // Buscar usuario web_system existente
            const result = await client.query(`
            SELECT id_usuario, nombre_usuario, rol
            FROM usuarios 
            WHERE nombre_usuario = 'web_system'
            LIMIT 1
        `);

            if (result.rows.length === 0) {
                console.log('⚠️ No existe usuario web_system, creando uno...');

                const id_usuario = uuidv4();

                // Crear usuario con rol PERSONAL_ADMISIONES
                // (el más apropiado para procesar solicitudes de admisión)
                await client.query(`
                INSERT INTO usuarios (id_usuario, nombre_usuario, contrasena, rol)
                VALUES ($1, $2, $3, $4)
            `, [
                    id_usuario,
                    'web_system',
                    'web_system_no_login', // Password placeholder
                    'PERSONAL_ADMISIONES' // ✅ ROL VÁLIDO
                ]);

                console.log('✅ Usuario web_system creado con éxito:', id_usuario);
                console.log('✅ Rol asignado: PERSONAL_ADMISIONES');
                return id_usuario;
            }

            console.log('✅ Usuario web_system encontrado:', result.rows[0].id_usuario);
            console.log('✅ Rol actual:', result.rows[0].rol);
            return result.rows[0].id_usuario;

        } catch (error) {
            console.error('❌ Error obteniendo usuario del sistema:', error);

            // Mensaje de error más específico
            if (error.code === '23514') { // Check constraint violation
                console.error('💡 ERROR: El rol no es válido');
                console.error('💡 Roles permitidos: ADMINISTRADOR, PERSONAL_ADMISIONES');
            }

            throw new Error(`Error obteniendo usuario del sistema: ${error.message}`);
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
     * Buscar o crear colegio
     */
    async buscarOCrearColegio(client, nombre, tipo = 'PUBLICO') {
        try {
            let result = await client.query(
                'SELECT id_colegio FROM colegios WHERE nombre ILIKE $1',
                [nombre.trim()]
            );

            if (result.rows.length > 0) {
                return result.rows[0].id_colegio;
            }

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

            console.log('👤 Buscando postulante con CI:', ci);

            let result = await client.query(
                'SELECT id_postulante FROM postulantes WHERE ci = $1',
                [ci]
            );

            if (result.rows.length > 0) {
                const id_postulante = result.rows[0].id_postulante;
                console.log('👤 Actualizando postulante existente:', id_postulante);

                await client.query(`
                    UPDATE postulantes 
                    SET nombre = $1, nacionalidad = $2, ciudad_procedencia = $3, 
                        colegio_id = $4, updated_at = CURRENT_TIMESTAMP
                    WHERE id_postulante = $5
                `, [nombre, nacionalidad, ciudad_procedencia, colegio_id, id_postulante]);

                return id_postulante;
            } else {
                const id_postulante = uuidv4();
                console.log('👤 Creando nuevo postulante:', id_postulante);

                await client.query(`
                    INSERT INTO postulantes (id_postulante, nombre, ci, nacionalidad, ciudad_procedencia, colegio_id, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [id_postulante, nombre, ci, nacionalidad, ciudad_procedencia, colegio_id]);

                return id_postulante;
            }

        } catch (error) {
            console.error('❌ Error gestionando postulante:', error);
            throw error;
        }
    }

    /**
     * Guardar datos del OCR
     */
    async guardarDatosOCR(client, postulante_id, datosOCR) {
        try {
            const existeOCR = await client.query(
                'SELECT id FROM datos_ocr WHERE postulante_id = $1',
                [postulante_id]
            );

            const datosExtraidos = JSON.stringify(datosOCR.completeData || datosOCR);
            const confianza = datosOCR.averageConfidence || datosOCR.confidence || 0;

            if (existeOCR.rows.length > 0) {
                await client.query(`
                    UPDATE datos_ocr 
                    SET datos_extraidos = $1, confianza = $2
                    WHERE postulante_id = $3
                `, [datosExtraidos, confianza, postulante_id]);
            } else {
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
     * Guardar contactos de emergencia
     */
    async guardarContactos(client, postulante_id, contactos) {
        try {
            await client.query(
                'DELETE FROM personas_contacto WHERE postulante_id = $1',
                [postulante_id]
            );

            for (const contacto of contactos) {
                if (contacto.nombre && contacto.nombre.trim()) {
                    const id = uuidv4();
                    await client.query(`
                        INSERT INTO personas_contacto (id, postulante_id, nombre, parentesco, telefono, correo)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [
                        id,
                        postulante_id,
                        contacto.nombre.trim(),
                        contacto.parentesco || contacto.relacion || 'Familiar',
                        contacto.telefono || '',
                        contacto.correo || null
                    ]);
                }
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
            const existeDoc = await client.query(
                'SELECT id FROM documentos WHERE postulante_id = $1',
                [postulante_id]
            );

            const fechaActual = new Date();
            const docData = {
                fotocopia_ci: documentos.carnet || false,
                certificado_nacimiento: documentos.certificado_nacimiento || false,
                fotografias: documentos.fotos || false,
                titulo_bachiller: documentos.titulo_bachiller || false,
                visa_estudiantil: documentos.visa_estudiantil || false,
                fecha_entrega_ci: documentos.carnet ? fechaActual : null,
                fecha_entrega_certificado: documentos.certificado_nacimiento ? fechaActual : null,
                fecha_entrega_fotos: documentos.fotos ? fechaActual : null,
                fecha_entrega_titulo: documentos.titulo_bachiller ? fechaActual : null,
                fecha_entrega_visa: documentos.visa_estudiantil ? fechaActual : null
            };

            if (existeDoc.rows.length > 0) {
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
     * Obtener estadísticas de preinscripciones
     */
    async obtenerEstadisticas(filtros = {}) {
        try {
            const { fecha_desde, fecha_hasta } = filtros;

            console.log('📊 Generando estadísticas con filtros:', filtros);

            // Construir WHERE dinámicamente
            const conditions = [];
            const params = [];
            let paramCount = 0;

            if (fecha_desde) {
                paramCount++;
                conditions.push(`p.fecha_registro >= $${paramCount}`);
                params.push(fecha_desde);
            }

            if (fecha_hasta) {
                paramCount++;
                conditions.push(`p.fecha_registro <= $${paramCount}`);
                params.push(fecha_hasta);
            }

            const whereClause = conditions.length > 0
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            // 1. Resumen general (formato requerido por el dashboard)
            const resumenQuery = `
                SELECT 
                    COUNT(*) as total_inscripciones,
                    COUNT(*) FILTER (WHERE DATE(p.fecha_registro) = CURRENT_DATE) as inscripciones_hoy,
                    COUNT(*) FILTER (WHERE p.estado = 'PENDIENTE') as pendientes_revision,
                    COUNT(*) FILTER (WHERE p.estado = 'APROBADA') as aprobadas,
                    COUNT(*) FILTER (WHERE p.estado = 'RECHAZADA') as rechazadas,
                    COUNT(*) FILTER (WHERE p.estado = 'DOCUMENTOS') as documentos_faltantes
                FROM preinscripciones p
                ${whereClause}
            `;

            const resumenResult = await pool.query(resumenQuery, params);
            const resumen = {
                totalInscripciones: parseInt(resumenResult.rows[0].total_inscripciones || 0),
                inscripcionesHoy: parseInt(resumenResult.rows[0].inscripciones_hoy || 0),
                pendientesRevision: parseInt(resumenResult.rows[0].pendientes_revision || 0),
                aprobadas: parseInt(resumenResult.rows[0].aprobadas || 0),
                rechazadas: parseInt(resumenResult.rows[0].rechazadas || 0),
                documentosFaltantes: parseInt(resumenResult.rows[0].documentos_faltantes || 0)
            };

            // 2. Distribución por carrera
            const carrerasQuery = `
                SELECT 
                    COALESCE(car.nombre_carrera, 'Sin carrera') as carrera,
                    COUNT(*) as cantidad,
                    ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM preinscripciones p2 ${whereClause}), 0), 2) as porcentaje
                FROM preinscripciones p
                JOIN postulantes post ON p.postulante_id = post.id_postulante
                LEFT JOIN carreras car ON post.id_carrera = car.id_carrera
                ${whereClause}
                GROUP BY car.nombre_carrera
                ORDER BY cantidad DESC
                LIMIT 10
            `;

            const carrerasResult = await pool.query(carrerasQuery, params);
            const porCarrera = carrerasResult.rows.map(row => ({
                carrera: row.carrera,
                cantidad: parseInt(row.cantidad),
                porcentaje: parseFloat(row.porcentaje || 0)
            }));

            // 3. Distribución por colegio
            const colegiosQuery = `
                SELECT 
                    COALESCE(c.nombre, 'Sin colegio') as colegio,
                    COUNT(*) as cantidad,
                    ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM preinscripciones p2 ${whereClause}), 0), 2) as porcentaje
                FROM preinscripciones p
                JOIN postulantes post ON p.postulante_id = post.id_postulante
                LEFT JOIN colegios c ON post.colegio_id = c.id_colegio
                ${whereClause}
                GROUP BY c.nombre
                ORDER BY cantidad DESC
                LIMIT 10
            `;

            const colegiosResult = await pool.query(colegiosQuery, params);
            const porColegio = colegiosResult.rows.map(row => ({
                colegio: row.colegio,
                cantidad: parseInt(row.cantidad),
                porcentaje: parseFloat(row.porcentaje || 0)
            }));

            // 4. Tendencia semanal (últimos 7 días)
            const tendenciaQuery = `
                SELECT 
                    TO_CHAR(p.fecha_registro, 'Day') as dia,
                    DATE(p.fecha_registro) as fecha,
                    COUNT(*) as cantidad
                FROM preinscripciones p
                WHERE p.fecha_registro >= CURRENT_DATE - INTERVAL '7 days'
                GROUP BY DATE(p.fecha_registro), TO_CHAR(p.fecha_registro, 'Day')
                ORDER BY fecha ASC
            `;

            const tendenciaResult = await pool.query(tendenciaQuery);
            const semana = tendenciaResult.rows.map(row => ({
                dia: row.dia.trim(),
                cantidad: parseInt(row.cantidad)
            }));

            console.log('✅ Estadísticas generadas:', {
                total: resumen.totalInscripciones,
                carreras: porCarrera.length,
                colegios: porColegio.length,
                dias: semana.length
            });

            return {
                resumen,
                distribucion: {
                    porCarrera,
                    porColegio
                },
                tendencia: {
                    semana
                }
            };

        } catch (error) {
            console.error('❌ Error en obtenerEstadisticas:', error);
            throw error;
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
     * Health check del servicio
     */
    async healthCheck() {
        try {
            const dbResult = await pool.query('SELECT NOW() as timestamp, version() as version');

            return {
                database: {
                    connected: true,
                    timestamp: dbResult.rows[0].timestamp,
                    version: dbResult.rows[0].version.split(' ')[0] + ' ' + dbResult.rows[0].version.split(' ')[1]
                },
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