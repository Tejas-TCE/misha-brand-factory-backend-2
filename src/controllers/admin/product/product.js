import { v2 as cloudinary } from "cloudinary";
import Product from "../../../models/product/product.js";
import Category from "../../../models/category/category.js";
import Color from "../../../models/color/color.js";
// import Brand from "../../../models/  /brand.js";
import asyncHandler from "express-async-handler";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PRODUCT_MESSAGES } from "../../../config/constant/product/productMessages.js";
import { STATUS } from "../../../config/constant/status/status.js";
import mongoose from "mongoose";

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @desc    Fetch products with filtering, sorting, and pagination
 * @route   GET /api/products
 * @access  Public
 */
export const getProducts = asyncHandler(async (req, res) => {
  const {
    search,
    page = 1,
    limit = 10,
    category,
    minPrice,
    maxPrice,
    sortBy = "createdAt",
    sortOrder = "desc",
    tags,
    status,
    size,
    colors,
    // brands,
    collections,
  } = req.query;

  // console.log("Query Parameters:", req.query);

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit) || 10;
  const skip = (pageNum - 1) * limitNum;

  const query = {};
  let message = PRODUCT_MESSAGES.PRODUCTS_FETCHED;

  if (search?.trim()) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { name: { $regex: escapedSearch, $options: "i" } },
      { description: { $regex: escapedSearch, $options: "i" } },
      { tags: { $regex: escapedSearch, $options: "i" } },
    ];
    message += ` matching "${search}"`;
    // console.log("Search Query:", query.$or);
  }

  if (category?.trim()) {
    if (mongoose.isValidObjectId(category)) {
      query.category = new mongoose.Types.ObjectId(category);
    } else {
      const categoryDoc = await Category.findOne({
        slug: category,
        isActive: true,
      }).lean();
      // console.log("Category Document:", categoryDoc);
      if (!categoryDoc) {
        res.status(STATUS.BAD_REQUEST);
        throw new Error("Invalid category");
      }
      query.category = categoryDoc._id;
    }
    message += ` in category "${category}"`;
  }

  if (minPrice || maxPrice) {
    query.base_price = {};
    if (minPrice) {
      query.base_price.$gte = parseFloat(minPrice);
      message += ` with price >= ${minPrice}`;
    }
    if (maxPrice) {
      query.base_price.$lte = parseFloat(maxPrice);
      message += ` with price <= ${maxPrice}`;
    }
    // console.log("Price Query:", query.base_price);
  }

  if (tags?.trim()) {
    let tagArray;
    try {
      // Try parsing as JSON array
      tagArray = JSON.parse(tags);
      if (!Array.isArray(tagArray)) {
        tagArray = [tagArray];
      }
    } catch {
      // Fallback to comma-separated string
      tagArray = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
    }
    if (tagArray.length === 0) {
      res.status(STATUS.BAD_REQUEST);
      throw new Error("Tags parameter cannot be empty");
    }
    tagArray = tagArray.map((tag) =>
      typeof tag === "string"
        ? tag
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
        : tag
    );
    // console.log("Tags Array:", tagArray);
    query.tags = { $all: tagArray };
    message += ` with tags "${tagArray.join(", ")}"`;
  }

  if (status?.trim()) {
    if (status.toLowerCase() === "active") {
      query.isActive = true;
      message += ` with status "active"`;
    } else if (status.toLowerCase() === "inactive") {
      query.isActive = false;
      message += ` with status "inactive"`;
    } else {
      res.status(STATUS.BAD_REQUEST);
      throw new Error('Invalid status value. Use "active" or "inactive"');
    }
    // console.log("Status Query:", { isActive: query.isActive });
  }

  if (size?.trim()) {
    query["variants.sizes.size"] = size.toUpperCase();
    message += ` with size "${size}"`;
    // console.log("Size Query:", {
    //   "variants.sizes.size": query["variants.sizes.size"],
    // });
  }

  if (colors?.trim()) {
    const colorArray = colors
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (colorArray.length === 0) {
      res.status(STATUS.BAD_REQUEST);
      throw new Error("Colors parameter cannot be empty");
    }
    const invalidColors = colorArray.filter(
      (id) => !mongoose.isValidObjectId(id)
    );
    if (invalidColors.length > 0) {
      res.status(STATUS.BAD_REQUEST);
      throw new Error(`Invalid color IDs: ${invalidColors.join(", ")}`);
    }
    query["variants.color"] = {
      $in: colorArray.map((id) => new mongoose.Types.ObjectId(id)),
    };
    message += ` with colors "${colors}"`;
    // console.log("Colors Query:", { "variants.color": query["variants.color"] });
  }

  // if (brands?.trim()) {
  //   let brandArray;
  //   try {
  //     // Try parsing as JSON array
  //     brandArray = JSON.parse(brands);
  //     if (!Array.isArray(brandArray)) {
  //       brandArray = [brandArray];
  //     }
  //   } catch {
  //     // Fallback to comma-separated string
  //     brandArray = brands
  //       .split(",")
  //       .map((id) => id.trim())
  //       .filter(Boolean);
  //   }
  //   if (brandArray.length === 0) {
  //     res.status(STATUS.BAD_REQUEST);
  //     throw new Error("Brands parameter cannot be empty");
  //   }
  //   const invalidBrands = brandArray.filter(
  //     (id) => !mongoose.isValidObjectId(id)
  //   );
  //   if (invalidBrands.length > 0) {
  //     res.status(STATUS.BAD_REQUEST);
  //     throw new Error(`Invalid brand IDs: ${invalidBrands.join(", ")}`);
  //   }
  //   query.brand = {
  //     $in: brandArray.map((id) => new mongoose.Types.ObjectId(id)),
  //   };
  //   message += ` with brands "${brandArray.join(", ")}"`;
  //   console.log("Brands Query:", { brand: query.brand });
  // }

  if (collections?.trim()) {
    let collectionArray;
    try {
      // Try parsing as JSON array
      collectionArray = JSON.parse(collections);
      if (!Array.isArray(collectionArray)) {
        collectionArray = [collectionArray];
      }
    } catch {
      // Fallback to comma-separated string
      collectionArray = collections
        .split(",")
        .map((col) => col.trim())
        .filter(Boolean);
    }
    if (collectionArray.length === 0) {
      res.status(STATUS.BAD_REQUEST);
      throw new Error("Collections parameter cannot be empty");
    }
    collectionArray = collectionArray.map((col) =>
      typeof col === "string"
        ? col
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
        : col
    );
    // console.log("Collections Array:", collectionArray);
    query.collections = { $all: collectionArray };
    message += ` with collections "${collectionArray.join(", ")}"`;
  }

  const sort = {};
  const validSortFields = ["createdAt"  , "base_price", "rating", "viewCount"];
  if (validSortFields.includes(sortBy)) {
    sort[sortBy] = sortOrder.toLowerCase() === "asc" ? 1 : -1;
  } else {
    sort.createdAt = -1;
  }
  // console.log("Sort Object:", sort);

  // console.log("Constructed Query:", query);

  try {
    const totalProducts = await Product.countDocuments(query);
    // console.log("Total Products:", totalProducts);

    let products = await Product.find(query)
      .populate("category", "name description")
      // .populate("brand", "name description")
      .populate("variants.color", "name hex")
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .lean();

    // console.log(
    //   "Fetched Products:",
    //   products.map((p) => p.name)
    // );
    // console.log("Pagination:", { pageNum, limitNum, skip, totalProducts });

    res.status(STATUS.OK).json({
      statusCode: STATUS.OK,
      message,
      data: {
        products,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalProducts / limitNum),
          totalItems: totalProducts,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    console.error("Product fetch/search error:", error);
    res.status(STATUS.SERVER_ERROR);
    throw new Error(`${PRODUCT_MESSAGES.SEARCH_FAILED}: ${error.message}`);
  }
});

/**
 * @desc    Create a new product
 * @route   POST /api/products
 * @access  Private (Admin)
 */
export const createProduct = asyncHandler(async (req, res) => {
    // console.log(req.body)
    let {
      name,
      category,
      description,
      variants,
      isActive,
      tags,
      videoUrl,
      isFeatured,
      isSoldOut,
      isVisible,
      specifications,
      collections,
      discount,
      variantImagesMeta,
    } = req.body;

    // Parse JSON fields
    const parseJsonField = (field, fieldName) => {
      if (field == null) {
        return fieldName === "specifications" ? {} : [];
      }
      if (Array.isArray(field)) {
        if (fieldName === "tags" || fieldName === "collections") {
          return field.map((item) =>
            typeof item === "string"
              ? item
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "")
              : item
          );
        }
        return field;
      }
      if (
        fieldName === "specifications" &&
        typeof field === "object" &&
        !Array.isArray(field)
      ) {
        return field;
      }
      if (typeof field === "string") {
        try {
          const parsed = JSON.parse(field);
          if (fieldName === "specifications") {
            return typeof parsed === "object" && !Array.isArray(parsed)
              ? parsed
              : {};
          }
          if (fieldName === "tags" || fieldName === "collections") {
            const items = Array.isArray(parsed) ? parsed : [parsed];
            return items.map((item) =>
              typeof item === "string"
                ? item
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-+|-+$/g, "")
                : item
            );
          }
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          if (fieldName === "specifications") {
            return {};
          }
          if (fieldName === "tags" || fieldName === "collections") {
            return [
              field
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, ""),
            ];
          }
          return [field];
        }
      }
      return fieldName === "specifications" ? {} : [field];
    };

    variants = parseJsonField(variants, "variants") || [];
    tags = parseJsonField(tags, "tags") || [];
    specifications = parseJsonField(specifications, "specifications") || [];
    collections = parseJsonField(collections, "collections") || [];
    variantImagesMeta =
      parseJsonField(variantImagesMeta, "variantImagesMeta") || [];

    // Validate required fields
    if (!name || !category  || variants.length === 0) {
      return res.status(STATUS.UNPROCESSABLE_ENTITY).json({
        statusCode: STATUS.UNPROCESSABLE_ENTITY,
        message:
          variants.length === 0
            ? "At least one variant is required"
            : PRODUCT_MESSAGES.VALIDATION_ERROR,
      });
    }

    // Validate category
    const categoryDoc = await Category.findById(category)
      .select("name description")
      .lean();
    if (!categoryDoc) {
      return res.status(STATUS.BAD_REQUEST).json({
        statusCode: STATUS.BAD_REQUEST,
        message: PRODUCT_MESSAGES.INVALID_CATEGORY_ID,
      });
    }

    // Validate colors in variants
    if (variants.length > 0) {
      const colorIds = variants.map((v) => v.color).filter(Boolean);
      const validColors = await Color.find({ _id: { $in: colorIds } }).lean();
      if (validColors.length !== colorIds.length) {
        return res.status(STATUS.BAD_REQUEST).json({
          statusCode: STATUS.BAD_REQUEST,
          message: "One or more colors are invalid",
        });
      }
    }

    // Add discount, rating, sizes validation and final price calculation
    for (const [index, variant] of variants.entries()) {
      // Convert price to number
      variant.price = Number(variant.price);
      
      // Convert discount to number
      variant.discount = variant.discount ? Number(variant.discount) : 0;

      // Convert rating to number
      variant.rating = variant.rating ? Number(variant.rating) : 0;

      // Discount: Must be between 0–100
      if (variant.discount < 0 || variant.discount > 100) {
        return res.status(400).json({
          message: `Variant ${index + 1} has invalid discount (0-100%)`,
        });
      }

      // Rating: Must be between 0–5
      if (variant.rating < 0 || variant.rating > 5) {
        return res.status(400).json({
          message: `Variant ${index + 1} has invalid rating (0-5 stars)`,
        });
      }

      // Sizes: Must be array with size + stock
      if (!variant.sizes || !Array.isArray(variant.sizes) || variant.sizes.length === 0) {
        return res.status(400).json({
          message: `Variant ${index + 1} must have at least one size`,
        });
      }

      for (const [i, sizeObj] of variant.sizes.entries()) {
        if (!sizeObj.size || typeof sizeObj.size !== 'string') {
          return res.status(400).json({
            message: `Size missing or invalid at variant ${index + 1}, size ${i + 1}`,
          });
        }
      }

      // Calculate discounted price
      if (variant.discount && typeof variant.price === 'number' && !isNaN(variant.price)) {
        const discountAmount = (variant.price * variant.discount) / 100;
        variant.finalPrice = Math.round(variant.price - discountAmount);
      } else {
        variant.finalPrice = variant.price;
      }
    }

    // Generate slug
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const existingProduct = await Product.findOne({ slug }).lean();
    if (existingProduct) {
      return res.status(STATUS.CONFLICT).json({
        statusCode: STATUS.CONFLICT,
        message: PRODUCT_MESSAGES.PRODUCT_EXISTS,
      });
    }

    if (req.files && variants.length > 0) {
      variants = variants.map((variant, index) => {
        const variantImageField = `variants[${index}][image]`;
        if (req.files[variantImageField]) {
          const variantImages = Array.isArray(req.files[variantImageField])
            ? req.files[variantImageField]
            : [req.files[variantImageField]];
          variant.images = variantImages.map((file, i) => ({
            url: file.path,
            public_id: file.filename,
            alt:
              req.body[`variants[${index}][imageAlt_${i}]`] ||
              `Variant ${index} Image ${i + 1}`,
            isPrimary: i === 0,
          }));
        } else {
          variant.images = [];
        }
        return variant;
      });
    }

    // Validate that at least one variant has images
    const hasImages = variants.some((v) => v.images?.length > 0);
    if (!hasImages && req.files && Object.keys(req.files).length > 0) {
      return res.status(STATUS.BAD_REQUEST).json({
        statusCode: STATUS.BAD_REQUEST,
        message: "Uploaded images must be assigned to a variant",
      });
    }

    // Create new product
    const product = new Product({
      name,
      slug,
      category,
      description,
      variants,
      isActive: isActive ?? true,
      tags,
      videoUrl,
      isFeatured: isFeatured ?? false,
      isSoldOut: isSoldOut ?? false,
      isVisible: isVisible ?? true,
      specifications,
      collections,
      discount: discount ?? 0,
    });

    try {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const createdProduct = await product.save({ session });

        await Category.findByIdAndUpdate(
          category,
          { $inc: { productCount: 1 } },
          { session }
        );

        const colorIds = [
          ...new Set(variants.map((v) => v.color).filter(Boolean)),
        ];
        if (colorIds.length > 0) {
          await Color.updateMany(
            { _id: { $in: colorIds } },
            { $inc: { productCount: 1 } },
            { session }
          );
        }

        await session.commitTransaction();

        const populatedProduct = await Product.findById(createdProduct._id)
          .populate("category", "name description")
          .populate("variants.color", "name hex")
          .lean();

        res.status(STATUS.CREATED).json({
          statusCode: STATUS.CREATED,
          message: PRODUCT_MESSAGES.PRODUCT_CREATED,
          data: populatedProduct,
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error("Product creation error:", error);
      res.status(STATUS.SERVER_ERROR).json({
        statusCode: STATUS.SERVER_ERROR,
        message: `${PRODUCT_MESSAGES.PRODUCT_CREATION_FAILED}: ${error.message}`,
      });
    }
  });
/**
 * @desc    Update an existing product
 * @route   PUT /api/products/:id
 * @access  Private (Admin)
 */
/**
/**
 * @desc    Update an existing product
 * @route   PUT /api/products/:id
 * @access  Private (Admin)
 */
export const updateProduct = asyncHandler(async (req, res) => {
  // Log request data for debugging
  // console.log("Update Product Request Body:", JSON.stringify(req.body, null, 2));
  // console.log("Update Product Request Files:", JSON.stringify(req.files, null, 2));

  // Validate product ID
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(STATUS.BAD_REQUEST).json({
      statusCode: STATUS.BAD_REQUEST,
      message: "Invalid product ID",
    });
  }

  // Find existing product
  const product = await Product.findById(req.params.id)
    .populate("category", "name description")
    .populate("variants.color", "name hex");

  if (!product) {
    return res.status(STATUS.NOT_FOUND).json({
      statusCode: STATUS.NOT_FOUND,
      message: PRODUCT_MESSAGES.PRODUCT_NOT_FOUND,
    });
  }

  // Validate category exists
  if (!product.category) {
    return res.status(STATUS.BAD_REQUEST).json({
      statusCode: STATUS.BAD_REQUEST,
      message: "Product is missing a valid category",
    });
  }

  // Log product data for debugging
  // console.log("Existing Product Data:", JSON.stringify(product, null, 2));

  // Destructure request body
  const {
    name,
    category,
    description,
    variants,
    isActive,
    tags,
    videoUrl,
    isFeatured,
    isSoldOut,
    isVisible,
    specifications,
    collections,
    discount,
  } = req.body;

  // Parse JSON fields
  const parseJsonField = (field, fieldName) => {
    if (field == null) {
      return fieldName === "specifications" ? product.specifications : product[fieldName] || [];
    }
    if (Array.isArray(field)) {
      if (fieldName === "tags" || fieldName === "collections") {
        return field.map((item) =>
          typeof item === "string"
            ? item.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
            : item
        );
      }
      if (fieldName === "variants") {
        const parsedVariants = [];
        for (const item of field) {
          const variant = typeof item === "string" ? JSON.parse(item) : item;
          const color = typeof variant.color === "string" ? variant.color : variant.color?._id?.toString();
          if (!color || !mongoose.isValidObjectId(color)) {
            console.warn(`Invalid color in variant: ${JSON.stringify(variant)}`);
            continue;
          }
          parsedVariants.push({ ...variant, color });
        }
        return parsedVariants.filter(
          (v) => v.color && v.price && v.sizes?.length > 0
        );
      }
      return field;
    }
    if (typeof field === "string") {
      try {
        const parsed = JSON.parse(field);
        if (fieldName === "specifications") {
          return typeof parsed === "object" && !Array.isArray(parsed) ? parsed : product.specifications;
        }
        if (fieldName === "tags" || fieldName === "collections") {
          const items = Array.isArray(parsed) ? parsed : [parsed];
          return items.map((item) =>
            typeof item === "string"
              ? item.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
              : item
          );
        }
        if (fieldName === "variants") {
          const parsedVariants = [];
          const items = Array.isArray(parsed) ? parsed : [parsed];
          items.forEach((v) => {
            const color = typeof v.color === "string" ? v.color : v.color?._id?.toString();
            if (!color || !mongoose.isValidObjectId(color)) {
              console.warn(`Invalid color in parsed variant: ${JSON.stringify(v)}`);
              return;
            }
            parsedVariants.push({ ...v, color });
          });
          return parsedVariants.filter(
            (v) => v.color && v.price && v.sizes?.length > 0
          );
        }
        return parsed;
      } catch {
        if (fieldName === "specifications") {
          const [key, value] = field.split(":").map((str) => str.trim());
          return key && value ? { [key]: value } : product.specifications;
        }
        if (fieldName === "tags" || fieldName === "collections") {
          return [field.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")];
        }
        throw new Error(`Invalid ${fieldName} format: ${field}`);
      }
    }
    if (fieldName === "specifications") {
      return typeof field === "object" && !Array.isArray(field) ? field : product.specifications;
    }
    return field;
  };

  const errors = [];
  let parsedVariants = variants ? parseJsonField(variants, "variants") : product.variants;
  const parsedTags = tags ? parseJsonField(tags, "tags") : product.tags;
  const parsedSpecifications = specifications ? parseJsonField(specifications, "specifications") : product.specifications;
  const parsedCollections = collections ? parseJsonField(collections, "collections") : product.collections;

  if (errors.length > 0) {
    return res.status(STATUS.BAD_REQUEST).json({
      statusCode: STATUS.BAD_REQUEST,
      message: errors.join("; "),
    });
  }

  // Validate variants
  if (parsedVariants && Array.isArray(parsedVariants)) {
    const colorIds = [...new Set(parsedVariants.map((v) => v.color).filter((color) => color && mongoose.isValidObjectId(color)))];
    if (colorIds.length > 0) {
      const validColors = await Color.find({ _id: { $in: colorIds } });
      if (validColors.length !== colorIds.length) {
        return res.status(STATUS.BAD_REQUEST).json({
          statusCode: STATUS.BAD_REQUEST,
          message: "One or more colors do not exist",
        });
      }
    }

    // Validate discount, rating, and sizes for variants
    for (const [index, variant] of parsedVariants.entries()) {
      if (variant.discount && (variant.discount < 0 || variant.discount > 100)) {
        return res.status(STATUS.BAD_REQUEST).json({
          statusCode: STATUS.BAD_REQUEST,
          message: `Variant ${index + 1} has invalid discount (0-100%)`,
        });
      }
      if (variant.rating && (variant.rating < 0 || variant.rating > 5)) {
        return res.status(STATUS.BAD_REQUEST).json({
          statusCode: STATUS.BAD_REQUEST,
          message: `Variant ${index + 1} has invalid rating (0-5 stars)`,
        });
      }
      if (!variant.sizes || !Array.isArray(variant.sizes) || variant.sizes.length === 0) {
        return res.status(STATUS.BAD_REQUEST).json({
          statusCode: STATUS.BAD_REQUEST,
          message: `Variant ${index + 1} must have at least one size`,
        });
      }
      for (const [i, sizeObj] of variant.sizes.entries()) {
        if (!sizeObj.size || typeof sizeObj.size !== "string") {
          return res.status(STATUS.BAD_REQUEST).json({
            statusCode: STATUS.BAD_REQUEST,
            message: `Size missing or invalid at variant ${index + 1}, size ${i + 1}`,
          });
        }
      }
    }
  }

  // Build updated variants with preserved images
  const updatedVariants = [];
  if (parsedVariants && Array.isArray(parsedVariants)) {
    parsedVariants.forEach((variant) => {
      if (!variant.color || !mongoose.isValidObjectId(variant.color) || !variant.price || !variant.sizes?.length) {
        console.warn(`Skipping invalid variant: ${JSON.stringify(variant)}`);
        return;
      }
      const colorId = variant.color.toString();
      const price = parseFloat(variant.price) || 0;
      const finalPrice = variant.discount && typeof price === "number"
        ? Math.round(price - (price * variant.discount) / 100)
        : price;

      // Find existing variant to preserve images
      const existingVariant = product.variants.find((v) => v.color?._id?.toString() === colorId);
      const images = existingVariant?.images || [];
      // console.log("LST LOG images",images);
      // console.log("LST LOG variantimages",variant.existingImages);
      let array = variant.existingImages ?  JSON.parse(variant.existingImages) : []
      console.log("array",array);
      
  
          
      updatedVariants.push({
        _id: variant._id && mongoose.isValidObjectId(variant._id) ? variant._id : new mongoose.Types.ObjectId(),
        color: variant.color,
        price,
        sizes: variant.sizes || [],
        images : array,
        discount: variant.discount ?? 0,
        rating: variant.rating ?? 0,
        finalPrice,
      });
    });
  } else {
    // If no variants provided, keep existing variants with images
    updatedVariants.push(...product.variants.map((v) => ({
      ...v.toObject(),
      color: v.color?._id?.toString(),
      images: v.images || [],
    })));
  }

  // Log updated variants before image processing
  // console.log("Updated Variants Before Image Processing:", JSON.stringify(updatedVariants, null, 2));

  // Handle image uploads for variants
  if (req.files && Object.keys(req.files).length > 0) {
    await Promise.all(
      updatedVariants.map(async (variant, index) => {
        const variantImageField = `variants[${index}][image]`;
        let images = variant.images || []; // Start with existing images

        // Log current images for this variant
        // console.log(`Processing images for variant ${index}:`, JSON.stringify(images, null, 2));

        // Handle new images
        if (req.files[variantImageField]) {
          const variantImages = Array.isArray(req.files[variantImageField])
            ? req.files[variantImageField]
            : [req.files[variantImageField]];

          // Append new images
          const newImages = variantImages.map((file, i) => ({
            url: file.path,
            public_id: file.filename,
            alt: req.body[`variants[${index}][imageAlt_${i}]`] || `Variant ${index} Image ${i + 1}`,
            isPrimary: images.length === 0 && i === 0, // Set isPrimary only if no existing images
          }));

          images = [...images, ...newImages]; // Append new images to existing ones
          // console.log(`New images added to variant ${index}:`, JSON.stringify(newImages, null, 2));
        }

        // Handle image removals
        const imagesToRemove = req.body[`variants[${index}][imagesToRemove]`] || [];
        if (imagesToRemove.length > 0) {
          // console.log(`Images to remove for variant ${index}:`, imagesToRemove);

          // Validate imagesToRemove contains valid public_ids
          const existingPublicIds = images.map((img) => img.public_id);
          const invalidPublicIds = imagesToRemove.filter((id) => !existingPublicIds.includes(id));
          if (invalidPublicIds.length > 0) {
            console.warn(`Invalid public_ids in imagesToRemove for variant ${index}:`, invalidPublicIds);
          }

          // Filter out images to be removed
          images = images.filter((img) => !imagesToRemove.includes(img.public_id));
          // console.log(`Images after removal for variant ${index}:`, JSON.stringify(images, null, 2));

          // Delete removed images from Cloudinary
          for (const publicId of imagesToRemove) {
            if (existingPublicIds.includes(publicId)) {
              try {
                await cloudinary.uploader.destroy(publicId);
                // console.log(`Deleted Cloudinary image: ${publicId}`);
              } catch (error) {
                console.error(`Failed to delete Cloudinary image ${publicId}:`, error);
              }
            } else {
              console.warn(`Skipping deletion of non-existent public_id: ${publicId}`);
            }
          }
        }

        // Ensure at least one image is marked as primary
        if (images.length > 0 && !images.some((img) => img.isPrimary)) {
          images[0].isPrimary = true;
          console.log(`Set first image as primary for variant ${index}`);
        }

        variant.images = images;
        console.log(`Final images for variant ${index}:`, JSON.stringify(images, null, 2));
      })
    );

    const hasImages = updatedVariants.some((v) => v.images?.length > 0);
    if (!hasImages) {
      return res.status(STATUS.BAD_REQUEST).json({
        statusCode: STATUS.BAD_REQUEST,
        message: "At least one variant must have images",
      });
    }
  }

  // Update slug if name changes
  let slug = product.slug;
  if (name && name !== product.name) {
    slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const existingProduct = await Product.findOne({ slug });
    if (existingProduct && existingProduct._id.toString() !== req.params.id) {
      return res.status(STATUS.CONFLICT).json({
        statusCode: STATUS.CONFLICT,
        message: PRODUCT_MESSAGES.PRODUCT_EXISTS,
      });
    }
  }

  // Start a transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Determine colors before and after
    const oldColorIds = [...new Set(product.variants.map((v) => v.color?._id?.toString()).filter(Boolean))];
    const newColorIds = [...new Set(updatedVariants.map((v) => v.color).filter(Boolean))];
    const colorsToIncrement = newColorIds.filter((id) => !oldColorIds.includes(id));
    const colorsToDecrement = oldColorIds.filter((id) => !newColorIds.includes(id));

    // Validate new category if provided
    let categoryId = product.category._id.toString();
    if (category) {
      if (!mongoose.isValidObjectId(category) || !/^[0-9a-fA-F]{24}$/.test(category)) {
        throw new Error(`Invalid category ID format: ${category}`);
      }
      const categoryDoc = await Category.findById(category).session(session);
      if (!categoryDoc) {
        throw new Error(`Category not found for ID: ${category}`);
      }
      categoryId = category;
    }

    // Update product fields
    const updateData = {
      name: name ?? product.name,
      slug,
      category: categoryId,
      description: description ?? product.description,
      variants: updatedVariants,
      isActive: isActive !== undefined ? String(isActive) === 'true' : product.isActive,
      tags: parsedTags,
      videoUrl: videoUrl ?? product.videoUrl,
      isFeatured: isFeatured !== undefined ? String(isFeatured) === 'true' : product.isFeatured,
      isSoldOut: isSoldOut !== undefined ? String(isSoldOut) === "true" : product.isSoldOut,
      isVisible: isVisible !== undefined ? String(isVisible) === "true" : product.isVisible,
      specifications: parsedSpecifications,
      collections: parsedCollections,
      discount: parseFloat(discount) || product.discount,
    };

    // Update category productCount
    if (category && category !== product.category._id.toString()) {
      await Category.findByIdAndUpdate(
        product.category._id,
        { $inc: { productCount: -1 } },
        { session }
      );
      await Category.findByIdAndUpdate(
        category,
        { $inc: { productCount: 1 } },
        { session }
      );
    }

    // Update color productCount
    if (colorsToIncrement.length > 0) {
      await Color.updateMany(
        { _id: { $in: colorsToIncrement } },
        { $inc: { productCount: 1 } },
        { session }
      );
    }
    if (colorsToDecrement.length > 0) {
      await Color.updateMany(
        { _id: { $in: colorsToDecrement } },
        { $inc: { productCount: -1 } },
        { session }
      );
    }

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true, session }
    )
      .populate("category", "name description")
      .populate("variants.color", "name hex");

    // Commit transaction
    await session.commitTransaction();

    // Transform response
    const transformResponse = (obj) => {
      if (Array.isArray(obj)) {
        return obj.map((item) => transformResponse(item));
      }
      if (typeof obj === "object" && obj !== null) {
        const newObj = { ...obj };
        if (newObj._id && newObj._id.buffer) {
          newObj._id = new mongoose.Types.ObjectId(newObj._id.buffer).toString();
        } else if (newObj._id && typeof newObj._id === "object" && newObj._id.toString) {
          newObj._id = newObj._id.toString();
        }
        if (newObj.createdAt && newObj.createdAt instanceof Date) {
          newObj.createdAt = newObj.createdAt.toISOString();
        }
        if (newObj.updatedAt && newObj.updatedAt instanceof Date) {
          newObj.updatedAt = newObj.updatedAt.toISOString();
        }
        delete newObj.id;
        Object.keys(newObj).forEach((key) => {
          newObj[key] = transformResponse(newObj[key]);
        });
        return newObj;
      }
      return obj;
    };

    const cleanedProduct = transformResponse(updatedProduct.toJSON({ virtuals: false }));

    // Log final product data
    console.log("Updated Product Data:", JSON.stringify(cleanedProduct, null, 2));

    res.status(STATUS.OK).json({
      statusCode: STATUS.OK,
      message: PRODUCT_MESSAGES.PRODUCT_UPDATED,
      data: cleanedProduct,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Product update error:", error.message);
    res.status(STATUS.SERVER_ERROR).json({
      statusCode: STATUS.SERVER_ERROR,
      message: `${PRODUCT_MESSAGES.PRODUCT_UPDATE_FAILED}: ${error.message}`,
    });
  } finally {
    session.endSession();
  }
});
/**
 * @desc    Delete a product
 * @route   DELETE /api/products/:id
 * @access  Private (Admin)
 */
export const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    return res.status(STATUS.NOT_FOUND).json({
      statusCode: STATUS.NOT_FOUND,
      message: PRODUCT_MESSAGES.PRODUCT_NOT_FOUND,
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const uploadsDir = path.join(__dirname, "../../../Uploads");
    product.variants.forEach((variant) => {
      variant.images?.forEach((img) => {
        const imagePath = path.join(uploadsDir, path.basename(img.url));
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      });
    });

    await Category.findByIdAndUpdate(
      product.category,
      { $inc: { productCount: -1 } },
      { session }
    );

    const colorIds = [
      ...new Set(
        product.variants.map((v) => v.color?._id?.toString()).filter(Boolean)
      ),
    ];
    if (colorIds.length > 0) {
      await Color.updateMany(
        { _id: { $in: colorIds } },
        { $inc: { productCount: -1 } },
        { session }
      );
    }

    await Product.deleteOne({ _id: req.params.id }, { session });

    await session.commitTransaction();

    res.status(STATUS.OK).json({
      statusCode: STATUS.OK,
      message: PRODUCT_MESSAGES.PRODUCT_DELETED,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Product deletion error:", error);
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * @desc    Fetch a single product by ID
 * @route   GET /api/products/:id
 * @access  Public
 */
export const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate("category", "name description")
    .populate("variants.color", "name hex")
    // .populate("brand", "name description")
    .lean();

  if (!product) {
    return res.status(STATUS.NOT_FOUND).json({
      statusCode: STATUS.NOT_FOUND,
      message: PRODUCT_MESSAGES.PRODUCT_ID_NOT_FOUND,
    });
  }

  await Product.findByIdAndUpdate(req.params.id, { $inc: { viewCount: 1 } });

  res.status(STATUS.OK).json({
    statusCode: STATUS.OK,
    message: PRODUCT_MESSAGES.PRODUCT_ID_FETCHED,
    data: product,
  });
});

/**
 * @desc    Search products by text
 * @route   GET /api/products/search
 * @access  Public
 */
export const searchProducts = asyncHandler(async (req, res) => {
  // console.log("Search Query Parameters:", req.query);

  const { search, page = 1, limit = 10 } = req.query;

  if (!search?.trim()) {
    return res.status(STATUS.BAD_REQUEST).json({
      statusCode: STATUS.BAD_REQUEST,
      message: "Search term is required",
    });
  }

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  const { query, message } = await buildSearchQuery(search);

  try {
    const totalProducts = await Product.countDocuments(query);
    // console.log("Total Products:", totalProducts);

    const products = await Product.find(query)
      .populate("category", "name description")
      .populate("brand", "name description")
      .populate("variants.color", "name hex")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // console.log(
    //   "Fetched Products:",
    //   products.map((p) => p.name)
    // );

    res.status(STATUS.OK).json({
      statusCode: STATUS.OK,
      message,
      data: {
        products,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalProducts / limitNum),
          totalItems: totalProducts,
          limit: limitNum,
        },
      },
    });
  } catch (error) {
    console.error("Product search error:", error);
    res.status(STATUS.SERVER_ERROR).json({
      statusCode: STATUS.SERVER_ERROR,
      message: `${PRODUCT_MESSAGES.SEARCH_FAILED}: ${error.message}`,
    });
  }
});

const buildSearchQuery = async (search) => {
  const query = { isActive: true };
  let message = PRODUCT_MESSAGES.PRODUCTS_FETCHED;

  if (search?.trim()) {
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { name: { $regex: escapedSearch, $options: "i" } },
      { description: { $regex: escapedSearch, $options: "i" } },
      { tags: { $regex: escapedSearch, $options: "i" } },
    ];
    message += ` matching "${search}"`;
    // console.log("Search Query:", query.$or);
  }

  return { query, message };
};

/**
 * @desc    Get product by ID, optionally update isSoldOut via query param
 * @route   GET /api/products/:id
 * @access  Public
 */
// import mongoose from "mongoose";

export const getAndUpdateProductById = asyncHandler(async (req, res) => {
  const productId = req.params.id;

  // ✅ Check for valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({
      statusCode: 400,
      message: "Invalid Product ID format",
    });
  }

  const product = await Product.findById(productId)
    .populate("category", "name description")
    .populate("variants.color", "name hex")
    .lean();

  if (!product) {
    return res.status(STATUS.NOT_FOUND).json({
      statusCode: STATUS.NOT_FOUND,
      message: PRODUCT_MESSAGES.PRODUCT_ID_NOT_FOUND,
    });
  }

  // ✅ Update viewCount
  await Product.findByIdAndUpdate(productId, { $inc: { viewCount: 1 } });

  // ✅ Optional isSoldOut update via query
  const isSoldOutQuery = req.query.isSoldOut;
  if (typeof isSoldOutQuery !== "undefined") {
    const isSoldOutBool = isSoldOutQuery === "true";
    await Product.findByIdAndUpdate(productId, { isSoldOut: isSoldOutBool });
    product.isSoldOut = isSoldOutBool;
  }

  // ✅ Optional isActive update via query
  const isActiveQuery = req.query.isActive;
  if (typeof isActiveQuery !== "undefined") {
    const isActiveBool = isActiveQuery === "true";
    await Product.findByIdAndUpdate(productId, { isActive: isActiveBool });
    product.isActive = isActiveBool;
  }

  res.status(STATUS.OK).json({
    statusCode: STATUS.OK,
    message: PRODUCT_MESSAGES.PRODUCT_ID_FETCHED,
    data: product,
  });
});






