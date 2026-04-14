/** Block shown in DynamicPageBlocks + CMS pages */
export type DynamicBlockAlign = 'left' | 'right' | 'center';

export interface DynamicBlock {
  id: string;
  type: 'text' | 'image';
  /** Plain text (line breaks preserved in UI) */
  text?: string;
  /** Data URL or path from image upload */
  imageUrl?: string;
  align: DynamicBlockAlign;
}

export interface CmsPageData {
  title: string;
  blocks: DynamicBlock[];
}

/** Firestore content/siteConfig shape */
export interface SiteConfigDoc {
  pageBackgrounds?: Record<string, string>;
  /** keyed by short page id e.g. home, surfing-festival */
  dynamicBlocks?: Record<string, DynamicBlock[]>;
  /** keyed by slug for /p/[slug] */
  cmsPages?: Record<string, CmsPageData>;
  updatedAt?: string;
  updatedBy?: string;
}
