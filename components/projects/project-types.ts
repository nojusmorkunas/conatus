import type { LabelEntity, ProjectEntity } from "@/lib/offline/types";

export type Project = ProjectEntity;
export type Label = LabelEntity;
export type ProjectDropIndicator = { anchorId: string | null; depth: number } | null;
