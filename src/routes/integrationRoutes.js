import express from "express";
import {
  createEndpoint,
  createMapping,
  createResponseTemplate,
  dispatchMapping,
  getAllEndpoints,
  getAllMappings,
  getAllResponseTemplates,
  getIntegrationLogs,
  getSingleEndpoint,
  removeEndpoint,
  removeMapping,
  removeResponseTemplate,
  runTest,
  updateEndpoint,
  updateMapping,
  updateResponseTemplate,
} from "../controllers/integrationController.js";

const router = express.Router();

// endpoint catalog
router.get("/endpoints", getAllEndpoints);
router.post("/endpoints", createEndpoint);
router.get("/endpoints/:id", getSingleEndpoint);
router.put("/endpoints/:id", updateEndpoint);
router.delete("/endpoints/:id", removeEndpoint);

// response templates
router.get("/templates", getAllResponseTemplates);
router.post("/templates", createResponseTemplate);
router.put("/templates/:id", updateResponseTemplate);
router.delete("/templates/:id", removeResponseTemplate);

// mapping
router.get("/mappings", getAllMappings);
router.post("/mappings", createMapping);
router.put("/mappings/:id", updateMapping);
router.delete("/mappings/:id", removeMapping);

// execution
router.post("/test", runTest);
router.post("/dispatch", dispatchMapping);
router.get("/logs", getIntegrationLogs);

export default router;
