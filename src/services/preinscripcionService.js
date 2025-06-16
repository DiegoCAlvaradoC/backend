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
                usuario_sistema_id = usuario_id || await this.obtenerUsuarioSistemaSeguro(client);
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
     * Obtener usuario admin existente
     */
    async obtenerUsuarioSistemaSeguro(client) {
        try {
            console.log('👨‍💼 Buscando usuario admin existente...');
            
            let result = await client.query(`
                SELECT id_usuario, nombre_usuario, rol
                FROM usuarios 
                WHERE nombre_usuario = 'admin' AND rol = 'ADMIN'
                LIMIT 1
            `);

            if (result.rows.length > 0) {
                console.log('✅ Usuario admin encontrado:', {
                    id: result.rows[0].id_usuario,
                    username: result.rows[0].nombre_usuario,
                    rol: result.rows[0].rol
                });
                return result.rows[0].id_usuario;
            }

            result = await client.query(`
                SELECT id_usuario, nombre_usuario, rol
                FROM usuarios 
                WHERE rol = 'ADMIN'
                ORDER BY created_at ASC
                LIMIT 1
            `);

            if (result.rows.length > 0) {
                console.log('✅ Usuario ADMIN encontrado:', {
                    id: result.rows[0].id_usuario,
                    username: result.rows[0].nombre_usuario,
                    rol: result.rows[0].rol
                });
                return result.rows[0].id_usuario;
            }

            throw new Error('No se encontró ningún usuario ADMIN en la base de datos');

        } catch (error) {
            console.error('❌ Error obteniendo usuario admin:', error);
            throw error;
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