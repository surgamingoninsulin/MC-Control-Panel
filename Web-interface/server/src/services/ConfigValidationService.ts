import path from "node:path";
import yaml from "js-yaml";
import * as toml from "@iarna/toml";

export class ConfigValidationService {
  validate(inputPath: string, content: string): {
    ok: boolean;
    format: string;
    errors: string[];
    hints: string[];
  } {
    const ext = path.extname(inputPath).toLowerCase();
    const errors: string[] = [];
    const hints: string[] = [];
    let format = "plain";

    try {
      if (ext === ".json") {
        format = "json";
        JSON.parse(content);
        hints.push("JSON parsed successfully.");
      } else if (ext === ".yml" || ext === ".yaml") {
        format = "yaml";
        yaml.load(content);
        hints.push("YAML parsed successfully.");
      } else if (ext === ".toml") {
        format = "toml";
        toml.parse(content);
        hints.push("TOML parsed successfully.");
      } else if (
        ext === ".properties" ||
        ext === ".cfg" ||
        ext === ".conf" ||
        ext === ".txt"
      ) {
        format = "properties";
        const lines = content.split(/\r?\n/);
        lines.forEach((line, index) => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) return;
          if (!trimmed.includes("=") && !trimmed.includes(":")) {
            errors.push(`Line ${index + 1} has no key-value separator.`);
          }
        });
        if (!errors.length) hints.push("Properties-style syntax looks valid.");
      } else {
        hints.push("No parser configured for this file type.");
      }
    } catch (error) {
      errors.push((error as Error).message);
    }

    return { ok: errors.length === 0, format, errors, hints };
  }
}
