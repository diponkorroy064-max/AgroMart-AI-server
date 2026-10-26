import { ObjectId } from 'mongodb';

export interface IBlogAuthor {
  name: string;
  role: string;
  avatar?: string;
}

export interface IBlogSection {
  sectionTitle: string;
  paragraphs: string[];
  tipBox?: string;
  warningBox?: string;
  bulletPoints?: string[];
}

export interface IBlog {
  _id?: ObjectId;
  title: string;
  slug: string;
  subtitle?: string;
  category: string;
  categorySlug: string;
  readTime: string;
  date?: string;
  author: IBlogAuthor;
  image: string;
  excerpt: string;
  featured?: boolean;
  tags?: string[];
  keyTakeaways?: string[];
  sections?: IBlogSection[];
  content?: string;
  isPublished: boolean;
  createdAt: Date;
  updatedAt?: Date;
}
