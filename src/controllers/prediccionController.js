// controllers/prediccionController.js
const prediccionService = require('../services/prediccionService');

class PrediccionController {

  /**
   * POST /api/prediccion/inscripciones
   * Predice inscripciones futuras
   */
  async predecirInscripciones(req, res) {
    try {
      const prediccion = await prediccionService.predecirInscripciones();
      
      res.json({
        success: true,
        data: prediccion,
        message: 'Predicción generada exitosamente'
      });

    } catch (error) {
      console.error('Error en predecirInscripciones:', error);
      res.status(500).json({
        success: false,
        error: 'Error generando predicción',
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
      console.error('Error en predecirPorCarrera:', error);
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
      console.error('Error en calcularScoring:', error);
      res.status(500).json({
        success: false,
        error: 'Error calculando scoring',
        message: error.message
      });
    }
  }

  /**
   * GET /api/prediccion/desercion/:postulante_id
   * Predice riesgo de deserción
   */
  async predecirDesercion(req, res) {
    try {
      const { postulante_id } = req.params;

      const prediccion = await prediccionService.predecirDesercion(postulante_id);
      
      res.json({
        success: true,
        data: prediccion,
        message: 'Predicción de deserción generada'
      });

    } catch (error) {
      console.error('Error en predecirDesercion:', error);
      res.status(500).json({
        success: false,
        error: 'Error prediciendo deserción',
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