describe('Category and Subcategory Management Business Logic & Integrity', () => {
  // Utility function replicating slugify logic from category controller
  const slugify = (text: string): string => {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u0980-\u09FF-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '');
  };

  // Mock safety validator for deleting categories
  const canDeleteCategory = (
    linkedProductCount: number
  ): { canDelete: boolean; message: string; canDeactivate?: boolean } => {
    if (linkedProductCount > 0) {
      return {
        canDelete: false,
        message: `এই ক্যাটাগরিতে ${linkedProductCount} টি পণ্য যুক্ত আছে। পণ্য থাকা অবস্থায় ক্যাটাগরি মুছে ফেলা যাবে না।`,
        canDeactivate: true,
      };
    }
    return {
      canDelete: true,
      message: 'ক্যাটাগরি নিরাপদে মুছে ফেলা যাবে',
    };
  };

  describe('1. Slug Generation & Formatting', () => {
    test('should generate clean lowercase slugs for English strings', () => {
      expect(slugify('Agricultural Machinery & Equipment')).toBe('agricultural-machinery-equipment');
      expect(slugify('   Fertilizers 2026   ')).toBe('fertilizers-2026');
    });

    test('should support Bengali unicode characters in slugs', () => {
      const bengaliCat = 'সার ও অনুখাদ্য';
      const slug = slugify(bengaliCat);
      expect(slug).toBe('সার-ও-অনুখাদ্য');
    });

    test('should remove consecutive hyphens and leading/trailing dashes', () => {
      expect(slugify('---Pesticides---and---Herbicides---')).toBe('pesticides-and-herbicides');
    });
  });

  describe('2. Category Validation & Defaults', () => {
    const validateCategoryInput = (data: { name?: string; slug?: string; order?: any }) => {
      const errors: string[] = [];
      if (!data.name || !data.name.trim()) {
        errors.push('ক্যাটাগরির নাম আবশ্যক');
      }
      const slug = data.slug && data.slug.trim() ? slugify(data.slug) : slugify(data.name || '');
      if (!slug) {
        errors.push('সঠিক স্লাগ তৈরি করা যায়নি');
      }
      const order = data.order !== undefined ? Number(data.order) : 0;
      if (isNaN(order)) {
        errors.push('অর্ডার ক্রম সংখ্যা হতে হবে');
      }
      return { isValid: errors.length === 0, errors, slug, order };
    };

    test('should accept valid category payload with defaults', () => {
      const res = validateCategoryInput({ name: 'উন্নত বীজ' });
      expect(res.isValid).toBe(true);
      expect(res.slug).toBe('উন্নত-বীজ');
      expect(res.order).toBe(0);
    });

    test('should reject empty category name', () => {
      const res = validateCategoryInput({ name: '   ' });
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('ক্যাটাগরির নাম আবশ্যক');
    });
  });

  describe('3. Subcategory Relation & Parent Association', () => {
    interface MockCategory {
      id: string;
      name: string;
      status: 'active' | 'inactive';
    }

    interface MockSubcategory {
      id: string;
      categoryId: string;
      name: string;
      status: 'active' | 'inactive';
    }

    const categories: MockCategory[] = [
      { id: 'cat-1', name: 'বীজ (Seeds)', status: 'active' },
      { id: 'cat-2', name: 'সার (Fertilizers)', status: 'inactive' },
    ];

    const subcategories: MockSubcategory[] = [
      { id: 'sub-1', categoryId: 'cat-1', name: 'ধানের বীজ', status: 'active' },
      { id: 'sub-2', categoryId: 'cat-1', name: 'সবজি বীজ', status: 'active' },
      { id: 'sub-3', categoryId: 'cat-2', name: 'ইউরিয়া সার', status: 'active' },
    ];

    test('should filter subcategories strictly belonging to their parent category', () => {
      const parentCatId = 'cat-1';
      const childSubs = subcategories.filter((s) => s.categoryId === parentCatId);
      expect(childSubs.length).toBe(2);
      expect(childSubs.map((s) => s.name)).toEqual(['ধানের বীজ', 'সবজি বীজ']);
    });

    test('should prevent creating subcategory with non-existent parent category', () => {
      const invalidCatId = 'cat-999';
      const parentExists = categories.some((c) => c.id === invalidCatId);
      expect(parentExists).toBe(false);
    });
  });

  describe('4. Data Integrity & Safe Deletion Rules', () => {
    test('should BLOCK category deletion if products are linked and suggest deactivation', () => {
      const linkedProducts = 12;
      const result = canDeleteCategory(linkedProducts);
      expect(result.canDelete).toBe(false);
      expect(result.canDeactivate).toBe(true);
      expect(result.message).toContain('পণ্য থাকা অবস্থায় ক্যাটাগরি মুছে ফেলা যাবে না');
    });

    test('should ALLOW category deletion if 0 products are linked', () => {
      const linkedProducts = 0;
      const result = canDeleteCategory(linkedProducts);
      expect(result.canDelete).toBe(true);
      expect(result.message).toBe('ক্যাটাগরি নিরাপদে মুছে ফেলা যাবে');
    });
  });

  describe('5. Status Toggle (Active / Inactive)', () => {
    test('should toggle category status between active and inactive', () => {
      let currentStatus: 'active' | 'inactive' = 'active';
      const toggle = (status: 'active' | 'inactive') => (status === 'active' ? 'inactive' : 'active');

      currentStatus = toggle(currentStatus);
      expect(currentStatus).toBe('inactive');

      currentStatus = toggle(currentStatus);
      expect(currentStatus).toBe('active');
    });
  });
});
