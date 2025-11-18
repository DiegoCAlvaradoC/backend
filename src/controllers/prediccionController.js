// controllers/prediccionController.js
const prediccionService = require('../services/prediccionService');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

class PrediccionController {

  /**
   * GET /api/prediccion/datos-historicos
   * Obtiene datos históricos para el frontend
   */
  async obtenerDatosHistoricos(req, res) {
    try {
      const { periodos = 10 } = req.query;

      console.log(`📊 Solicitando ${periodos} períodos históricos`);

      const datos = await prediccionService.obtenerDatosHistoricos(parseInt(periodos));

      res.json({
        success: true,
        data: datos,
        message: 'Datos históricos obtenidos exitosamente'
      });

    } catch (error) {
      console.error('❌ Error en obtenerDatosHistoricos:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo datos históricos',
        message: error.message
      });
    }
  }

  /**
   * POST /api/prediccion/inscripciones
   * Predice inscripciones futuras
   */
  async predecirInscripciones(req, res) {
    try {
      const config = req.body;

      console.log('🔮 Generando predicción con configuración:', config);

      const prediccion = await prediccionService.predecirInscripciones(config);

      if (prediccion.error) {
        return res.status(400).json({
          success: false,
          error: prediccion.error,
          message: prediccion.mensaje
        });
      }

      res.json({
        success: true,
        data: prediccion,
        message: 'Predicción generada exitosamente'
      });

    } catch (error) {
      console.error('❌ Error en predecirInscripciones:', error);
      res.status(500).json({
        success: false,
        error: 'Error generando predicción',
        message: error.message
      });
    }
  }

  /**
   * GET /api/prediccion/historial
   * Obtiene historial de predicciones
   */
  async obtenerHistorial(req, res) {
    try {
      const { limit = 10 } = req.query;

      const historial = await prediccionService.obtenerHistorialPredicciones(parseInt(limit));

      res.json({
        success: true,
        data: historial,
        message: 'Historial obtenido exitosamente'
      });

    } catch (error) {
      console.error('❌ Error en obtenerHistorial:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo historial',
        message: error.message
      });
    }
  }

  /**
   * POST /api/prediccion/exportar/pdf
   * Exporta predicción a PDF
   */
  async exportarPDF(req, res) {
    try {
      const prediccion = req.body;

      if (!prediccion || !prediccion.prediccionTotal) {
        return res.status(400).json({
          success: false,
          error: 'Datos de predicción requeridos'
        });
      }

      console.log('📄 Generando PDF de predicción...');

      // Crear documento PDF
      const doc = new PDFDocument({ margin: 50 });

      // Set headers para descarga
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=prediccion-${Date.now()}.pdf`);

      doc.pipe(res);

      // Título
      doc.fontSize(20)
          .font('Helvetica-Bold')
          .text('Reporte de Predicción de Inscritos', { align: 'center' });

      doc.moveDown();
      doc.fontSize(12)
          .font('Helvetica')
          .text(`Generado el: ${new Date().toLocaleDateString('es-BO')}`, { align: 'center' });

      doc.moveDown(2);

      // Predicción Principal
      doc.fontSize(16)
          .font('Helvetica-Bold')
          .text('Predicción Principal', { underline: true });

      doc.moveDown();
      doc.fontSize(14)
          .font('Helvetica')
          .text(`Predicción Total: ${prediccion.prediccionTotal} estudiantes`, { indent: 20 });

      doc.text(`Tendencia: ${prediccion.tendencia}`, { indent: 20 });
      doc.text(`Precisión del Modelo: ${prediccion.precision}%`, { indent: 20 });

      doc.moveDown();

      // Intervalo de Confianza
      doc.fontSize(12)
          .text(`Intervalo de Confianza (95%):`, { indent: 20 });
      doc.text(`  Mínimo: ${prediccion.intervalConfianza.min}`, { indent: 40 });
      doc.text(`  Máximo: ${prediccion.intervalConfianza.max}`, { indent: 40 });

      doc.moveDown(2);

      // Predicciones por Carrera
      if (prediccion.prediccionesPorCarrera && prediccion.prediccionesPorCarrera.length > 0) {
        doc.fontSize(16)
            .font('Helvetica-Bold')
            .text('Predicciones por Carrera', { underline: true });

        doc.moveDown();
        doc.fontSize(12).font('Helvetica');

        prediccion.prediccionesPorCarrera.forEach((carrera, index) => {
          doc.text(`${index + 1}. ${carrera.carrera}: ${carrera.prediccion} estudiantes`, { indent: 20 });
        });

        doc.moveDown(2);
      }

      // Factores Considerados
      if (prediccion.factores && prediccion.factores.length > 0) {
        doc.fontSize(16)
            .font('Helvetica-Bold')
            .text('Factores Considerados', { underline: true });

        doc.moveDown();
        doc.fontSize(12).font('Helvetica');

        prediccion.factores.forEach((factor, index) => {
          doc.text(`• ${factor}`, { indent: 20 });
        });

        doc.moveDown(2);
      }

      // Recomendaciones
      if (prediccion.recomendaciones && prediccion.recomendaciones.length > 0) {
        doc.fontSize(16)
            .font('Helvetica-Bold')
            .text('Recomendaciones', { underline: true });

        doc.moveDown();
        doc.fontSize(12).font('Helvetica');

        prediccion.recomendaciones.forEach((rec, index) => {
          doc.text(`${index + 1}. ${rec}`, { indent: 20 });
        });
      }

      // Footer
      doc.moveDown(3);
      doc.fontSize(10)
          .font('Helvetica')
          .text('Universidad Católica Boliviana "San Pablo"', { align: 'center' });
      doc.text('Sistema de Gestión de Admisiones', { align: 'center' });

      // Finalizar PDF
      doc.end();

      console.log('✅ PDF generado exitosamente');

    } catch (error) {
      console.error('❌ Error exportando PDF:', error);
      res.status(500).json({
        success: false,
        error: 'Error generando PDF',
        message: error.message
      });
    }
  }

  /**
   * POST /api/prediccion/exportar/excel
   * Exporta predicción a Excel
   */
  async exportarExcel(req, res) {
    try {
      const prediccion = req.body;

      if (!prediccion || !prediccion.prediccionTotal) {
        return res.status(400).json({
          success: false,
          error: 'Datos de predicción requeridos'
        });
      }

      console.log('📊 Generando Excel de predicción...');

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sistema UCB';
      workbook.created = new Date();

      // Hoja 1: Resumen
      const resumenSheet = workbook.addWorksheet('Resumen');

      resumenSheet.columns = [
        { header: 'Métrica', key: 'metrica', width: 30 },
        { header: 'Valor', key: 'valor', width: 20 }
      ];

      resumenSheet.addRows([
        { metrica: 'Predicción Total', valor: prediccion.prediccionTotal },
        { metrica: 'Intervalo Mínimo', valor: prediccion.intervalConfianza.min },
        { metrica: 'Intervalo Máximo', valor: prediccion.intervalConfianza.max },
        { metrica: 'Precisión del Modelo', valor: `${prediccion.precision}%` },
        { metrica: 'Tendencia', valor: prediccion.tendencia },
        { metrica: 'Fecha de Generación', valor: new Date().toLocaleDateString('es-BO') }
      ]);

      // Estilo del header
      resumenSheet.getRow(1).font = { bold: true };
      resumenSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2563EB' }
      };
      resumenSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

      // Hoja 2: Predicciones por Carrera
      if (prediccion.prediccionesPorCarrera && prediccion.prediccionesPorCarrera.length > 0) {
        const carrerasSheet = workbook.addWorksheet('Por Carrera');

        carrerasSheet.columns = [
          { header: 'Carrera', key: 'carrera', width: 40 },
          { header: 'Predicción', key: 'prediccion', width: 15 }
        ];

        carrerasSheet.addRows(prediccion.prediccionesPorCarrera);

        // Estilo del header
        carrerasSheet.getRow(1).font = { bold: true };
        carrerasSheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF10B981' }
        };
        carrerasSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }

      // Hoja 3: Datos Históricos
      if (prediccion.datosHistoricos && prediccion.datosHistoricos.length > 0) {
        const historicoSheet = workbook.addWorksheet('Datos Históricos');

        historicoSheet.columns = [
          { header: 'Período', key: 'periodo', width: 15 },
          { header: 'Total Inscritos', key: 'total', width: 15 }
        ];

        historicoSheet.addRows(prediccion.datosHistoricos);

        // Estilo del header
        historicoSheet.getRow(1).font = { bold: true };
        historicoSheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF59E0B' }
        };
        historicoSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }

      // Hoja 4: Recomendaciones
      if (prediccion.recomendaciones && prediccion.recomendaciones.length > 0) {
        const recomendacionesSheet = workbook.addWorksheet('Recomendaciones');

        recomendacionesSheet.columns = [
          { header: '#', key: 'numero', width: 5 },
          { header: 'Recomendación', key: 'recomendacion', width: 80 }
        ];

        recomendacionesSheet.addRows(
            prediccion.recomendaciones.map((rec, index) => ({
              numero: index + 1,
              recomendacion: rec
            }))
        );

        // Estilo del header
        recomendacionesSheet.getRow(1).font = { bold: true };
        recomendacionesSheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF8B5CF6' }
        };
        recomendacionesSheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };
      }

      // Set headers para descarga
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=prediccion-${Date.now()}.xlsx`);

      await workbook.xlsx.write(res);
      res.end();

      console.log('✅ Excel generado exitosamente');

    } catch (error) {
      console.error('❌ Error exportando Excel:', error);
      res.status(500).json({
        success: false,
        error: 'Error generando Excel',
        message: error.message
      });
    }
  }

  /**
   * POST /api/prediccion/carrera
   * Predice inscripciones por carrera
   */
  async predecirPorCarrera(req, res) {
    try {
      const { carrera } = req.body;

      if (!carrera) {
        return res.status(400).json({
          success: false,
          error: 'Carrera requerida',
          message: 'Se debe especificar una carrera'
        });
      }

      const prediccion = await prediccionService.predecirPorCarrera(carrera);

      res.json({
        success: true,
        data: prediccion,
        message: 'Predicción por carrera generada'
      });

    } catch (error) {
      console.error('❌ Error en predecirPorCarrera:', error);
      res.status(500).json({
        success: false,
        error: 'Error generando predicción',
        message: error.message
      });
    }
  }

  /**
   * GET /api/prediccion/scoring/:preinscripcion_id
   * Calcula scoring de postulante
   */
  async calcularScoring(req, res) {
    try {
      const { preinscripcion_id } = req.params;

      const scoring = await prediccionService.calcularScoring(preinscripcion_id);

      res.json({
        success: true,
        data: scoring,
        message: 'Scoring calculado exitosamente'
      });

    } catch (error) {
      console.error('❌ Error en calcularScoring:', error);
      res.status(500).json({
        success: false,
        error: 'Error calculando scoring',
        message: error.message
      });
    }
  }

  /**
   * GET /api/prediccion/health
   * Health check
   */
  async healthCheck(req, res) {
    try {
      const health = await prediccionService.healthCheck();

      res.json({
        success: true,
        ...health
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        status: 'unhealthy',
        error: error.message
      });
    }
  }
}

module.exports = new PrediccionController();