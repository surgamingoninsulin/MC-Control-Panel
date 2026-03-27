import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import AdmZip from "adm-zip";
import { appConfig } from "../config.js";

type JavaResolution = {
  javaBinary: string;
  requiredJava: number | null;
  classMajor: number | null;
  downloaded: boolean;
};

const JAVA_CLASS_BASE = 44;

const parseJavaVersionFromText = (value: string): number | null => {
  const match = String(value || "").match(/version\s+"(\d+)(?:[.\-_][^"]*)?"/i);
  if (match?.[1]) return Number(match[1]);
  return null;
};

const classMajorToJava = (major: number): number => major - JAVA_CLASS_BASE;

const unique = <T>(values: T[]): T[] => [...new Set(values)];

export class JavaRuntimeService {
  private readonly jdkRoot: string;

  constructor() {
    this.jdkRoot = path.resolve(process.cwd(), "../libraries/jdks");
  }

  async ensureJavaForJar(jarPath: string): Promise<JavaResolution> {
    const required = await this.detectRequiredJavaVersion(jarPath);
    const classMajor = required ? required + JAVA_CLASS_BASE : null;
    const candidates = await this.collectJavaCandidates();
    if (!required) {
      const chosen = candidates[0] || appConfig.javaBinary;
      return { javaBinary: chosen, requiredJava: null, classMajor: null, downloaded: false };
    }
    for (const candidate of candidates) {
      const major = this.detectJavaMajor(candidate);
      if (major !== null && major >= required) {
        return { javaBinary: candidate, requiredJava: required, classMajor, downloaded: false };
      }
    }
    const downloaded = await this.downloadJdk(required);
    return { javaBinary: downloaded, requiredJava: required, classMajor, downloaded: true };
  }

  private async detectRequiredJavaVersion(jarPath: string): Promise<number | null> {
    try {
      const zip = new AdmZip(jarPath);
      const entries = zip
        .getEntries()
        .filter((entry) => !entry.isDirectory && entry.entryName.toLowerCase().endsWith(".class"));
      if (!entries.length) return null;
      const preferred = entries.find((entry) => /bundler\/main\.class$/i.test(entry.entryName));
      const sample = preferred ? [preferred] : entries.slice(0, 300);
      let maxMajor = 0;
      for (const entry of sample) {
        const data = entry.getData();
        if (!data || data.length < 8) continue;
        if (data.readUInt32BE(0) !== 0xcafebabe) continue;
        const major = data.readUInt16BE(6);
        if (major > maxMajor) maxMajor = major;
      }
      if (!maxMajor) return null;
      const required = classMajorToJava(maxMajor);
      return required > 0 ? required : null;
    } catch {
      return null;
    }
  }

  private async collectJavaCandidates(): Promise<string[]> {
    const found: string[] = [];
    const configured = String(appConfig.javaBinary || "").trim();
    if (configured) found.push(configured);

    const localJdks = await this.findLocalProjectJdks();
    found.push(...localJdks);

    if (process.platform === "win32") {
      const adoptiumDir = "C:\\Program Files\\Eclipse Adoptium";
      if (fs.existsSync(adoptiumDir)) {
        const dirs = fs.readdirSync(adoptiumDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /^jdk-/i.test(entry.name))
          .map((entry) => path.resolve(adoptiumDir, entry.name, "bin", "java.exe"));
        found.push(...dirs);
      }
    }

    const fromPath = spawnSync(process.platform === "win32" ? "where" : "which", ["java"], { encoding: "utf8" });
    if (fromPath.status === 0 && fromPath.stdout) {
      const lines = String(fromPath.stdout).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      found.push(...lines);
    }

    const filtered = unique(found)
      .map((value) => value.replace(/^"+|"+$/g, ""))
      .filter((value) => !!value && fs.existsSync(value));
    return filtered;
  }

  private async findLocalProjectJdks(): Promise<string[]> {
    try {
      await fsp.mkdir(this.jdkRoot, { recursive: true });
      const entries = await fsp.readdir(this.jdkRoot, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.resolve(this.jdkRoot, entry.name, "bin", process.platform === "win32" ? "java.exe" : "java"))
        .filter((candidate) => fs.existsSync(candidate));
    } catch {
      return [];
    }
  }

  private detectJavaMajor(javaBinary: string): number | null {
    try {
      const check = spawnSync(javaBinary, ["-version"], { encoding: "utf8" });
      const output = `${check.stdout || ""}\n${check.stderr || ""}`;
      return parseJavaVersionFromText(output);
    } catch {
      return null;
    }
  }

  private async downloadJdk(major: number): Promise<string> {
    await fsp.mkdir(this.jdkRoot, { recursive: true });
    const url = `https://api.adoptium.net/v3/binary/latest/${major}/ga/${this.platformSegment()}/${this.archSegment()}/jdk/hotspot/normal/eclipse`;
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new Error(`Could not download JDK ${major} from Adoptium.`);
    }
    const extension = process.platform === "win32" ? "zip" : "tar.gz";
    const archivePath = path.resolve(this.jdkRoot, `jdk-${major}-auto.${extension}`);
    const body = Buffer.from(await response.arrayBuffer());
    await fsp.writeFile(archivePath, body);

    if (process.platform === "win32") {
      const zip = new AdmZip(archivePath);
      zip.extractAllTo(this.jdkRoot, true);
    } else {
      throw new Error("Automatic JDK download is currently implemented for Windows only.");
    }

    await fsp.rm(archivePath, { force: true });
    const javaBin = await this.pickBestDownloadedJava(major);
    if (!javaBin) throw new Error(`JDK ${major} was downloaded but java binary was not found.`);
    return javaBin;
  }

  private async pickBestDownloadedJava(requiredMajor: number): Promise<string | null> {
    const candidates = await this.findLocalProjectJdks();
    const withVersion = candidates
      .map((candidate) => ({ candidate, major: this.detectJavaMajor(candidate) }))
      .filter((entry) => entry.major !== null)
      .sort((a, b) => Number(a.major) - Number(b.major));
    const match = withVersion.find((entry) => Number(entry.major) >= requiredMajor);
    return match?.candidate || withVersion.at(-1)?.candidate || null;
  }

  private platformSegment(): string {
    if (process.platform === "win32") return "windows";
    if (process.platform === "darwin") return "mac";
    return "linux";
  }

  private archSegment(): string {
    if (process.arch === "arm64") return "aarch64";
    if (process.arch === "x64") return "x64";
    return process.arch;
  }
}
