import express from "express";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from "../controllers/templateController.js";

const router = express.Router();
router.post("/create", createTemplate);
router.get("/list", listTemplates);
router.get("/:id", getTemplate);
router.put("/:id", updateTemplate);
router.delete("/:id", deleteTemplate);

export default router;
