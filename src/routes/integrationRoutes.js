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
import { listApis } from "../controllers/apiCatalogController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

// endpoint catalog
router.get("/endpoints", requirePrivilege("integration", "view"), getAllEndpoints);
router.post("/endpoints", requirePrivilege("integration", "create"), createEndpoint);
router.get("/endpoints/:id", requirePrivilege("integration", "view"), getSingleEndpoint);
router.put("/endpoints/:id", requirePrivilege("integration", "update"), updateEndpoint);
router.delete("/endpoints/:id", requirePrivilege("integration", "archive"), removeEndpoint);

// response templates
router.get("/templates", requirePrivilege("integration", "view"), getAllResponseTemplates);
router.post("/templates", requirePrivilege("integration", "create"), createResponseTemplate);
router.put("/templates/:id", requirePrivilege("integration", "update"), updateResponseTemplate);
router.delete("/templates/:id", requirePrivilege("integration", "archive"), removeResponseTemplate);

// mapping
router.get("/mappings", requirePrivilege("integration", "view"), getAllMappings);
router.post("/mappings", requirePrivilege("integration", "create"), createMapping);
router.put("/mappings/:id", requirePrivilege("integration", "update"), updateMapping);
router.delete("/mappings/:id", requirePrivilege("integration", "archive"), removeMapping);

// execution
router.post("/test", requirePrivilege("integration", "update"), runTest);
router.post("/dispatch", requirePrivilege("integration", "update"), dispatchMapping);
router.get("/logs", requirePrivilege("integration", "view"), getIntegrationLogs);
router.get("/apis", requirePrivilege("integration", "view"), listApis);

export default router;
