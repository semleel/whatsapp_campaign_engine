// src/routes/integrationRoutes.js

import express from "express";
import {
  getIntegrationLogs,
  previewApi,
  runTest,
  updateApiTemplate,
  generateTemplate,
} from "../controllers/integrationController.js";
import {
  createEndpoint,
  deleteEndpoint,
  getEndpoint,
  listArchivedEndpoints,
  listEndpoints,
  restoreEndpoint,
  updateEndpoint,
} from "../controllers/apiEndpointController.js";
import { listApis } from "../controllers/apiCatalogController.js";
import authMiddleware from "../middleware/auth.js";
import { requirePrivilege, requirePrivilegeAny } from "../middleware/permission.js";

const router = express.Router();

router.use(authMiddleware);

// endpoint catalog
router.get(
  "/endpoints",
  requirePrivilege("integration", "view"),
  listEndpoints
);
router.get(
  "/endpoints/archived",
  requirePrivilegeAny("integration", ["update", "archive"]),
  listArchivedEndpoints
);
router.post("/endpoints", requirePrivilege("integration", "create"), createEndpoint);
router.get("/endpoints/:id", requirePrivilege("integration", "view"), getEndpoint);
router.put("/endpoints/:id", requirePrivilege("integration", "update"), updateEndpoint);
router.delete("/endpoints/:id", requirePrivilege("integration", "archive"), deleteEndpoint);
router.post(
  "/endpoints/:id/restore",
  requirePrivilegeAny("integration", ["update", "archive"]),
  restoreEndpoint
);

// execution
router.post("/test", requirePrivilege("integration", "update"), runTest);
router.post(
  "/generate-template",
  requirePrivilege("integration", "update"),
  generateTemplate
);
router.get("/logs", requirePrivilege("integration", "view"), getIntegrationLogs);
router.get("/apis", requirePrivilege("integration", "view"), listApis);
router.get("/apis/:id/preview", requirePrivilege("integration", "view"), previewApi);
router.put("/apis/:id/template", requirePrivilege("integration", "update"), updateApiTemplate);

export default router;
