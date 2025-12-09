// src/routes/integrationRoutes.js

import express from "express";
import {
  getIntegrationLogs,
  runTest,
  updateApiTemplate,
} from "../controllers/integrationController.js";
import {
  createEndpoint,
  deleteEndpoint,
  getEndpoint,
  listEndpoints,
  updateEndpoint,
} from "../controllers/apiEndpointController.js";
import { listApis } from "../controllers/apiCatalogController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

// endpoint catalog
router.get("/endpoints", requirePrivilege("integration", "view"), listEndpoints);
router.post("/endpoints", requirePrivilege("integration", "create"), createEndpoint);
router.get("/endpoints/:id", requirePrivilege("integration", "view"), getEndpoint);
router.put("/endpoints/:id", requirePrivilege("integration", "update"), updateEndpoint);
router.delete("/endpoints/:id", requirePrivilege("integration", "archive"), deleteEndpoint);

// execution
router.post("/test", requirePrivilege("integration", "update"), runTest);
router.get("/logs", requirePrivilege("integration", "view"), getIntegrationLogs);
router.get("/apis", requirePrivilege("integration", "view"), listApis);
router.put("/apis/:id/template", requirePrivilege("integration", "update"), updateApiTemplate);

export default router;
