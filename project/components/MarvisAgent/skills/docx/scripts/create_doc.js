#!/usr/bin/env node
/**
 * create_doc.js - 从 JSON 描述文件创建 .docx 文档
 *
 * 用法：node create_doc.js <json_file> <output_file>
 *
 * 模型只需生成 JSON 描述文件，本脚本负责将其转换为合规的 .docx 文件。
 * 所有 docx-js 的 API 细节、格式规范、属性补全都由本脚本保证。
 */

const fs = require("fs");
const path = require("path");
const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
    Header, Footer, AlignmentType, PageOrientation, LevelFormat, ExternalHyperlink,
    InternalHyperlink, Bookmark, FootnoteReferenceRun, PositionalTab,
    PositionalTabAlignment, PositionalTabRelativeTo, PositionalTabLeader,
    TabStopType, TabStopPosition, Column, SectionType,
    TableOfContents, HeadingLevel, BorderStyle, WidthType, ShadingType,
    VerticalAlign, PageNumber, PageBreak
} = require("docx");

// ============================================================
// 常量定义
// ============================================================

// 1 英寸 = 1440 DXA
const DXA_PER_INCH = 1440;
// 1 厘米 ≈ 567 DXA
const DXA_PER_CM = 567;
// 1 磅 = 2 半磅（docx-js size 单位为半磅）
const HALF_POINTS_PER_PT = 2;
// 1 磅 = 20 缇（twips）
const TWIPS_PER_PT = 20;

/** 预定义页面大小（DXA 单位） */
const PAGE_SIZES = {
    "letter": { width: 12240, height: 15840 },
    "us_letter": { width: 12240, height: 15840 },
    "a4": { width: 11906, height: 16838 },
    "a3": { width: 16838, height: 23811 },
    "a5": { width: 8391, height: 11906 },
    "b5": { width: 10319, height: 14571 },
    "legal": { width: 12240, height: 20160 },
};

/** 对齐方式映射 */
const ALIGNMENT_MAP = {
    "left": AlignmentType.LEFT,
    "center": AlignmentType.CENTER,
    "right": AlignmentType.RIGHT,
    "both": AlignmentType.JUSTIFIED,
    "justify": AlignmentType.JUSTIFIED,
    "justified": AlignmentType.JUSTIFIED,
};

/** HeadingLevel 映射 */
const HEADING_LEVEL_MAP = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
    4: HeadingLevel.HEADING_4,
    5: HeadingLevel.HEADING_5,
    6: HeadingLevel.HEADING_6,
};

/** 下划线样式映射 */
const UNDERLINE_MAP = {
    "single": "single",
    "double": "double",
    "thick": "thick",
    "dotted": "dotted",
    "dash": "dash",
    "wave": "wave",
};

// ============================================================
// 工具函数
// ============================================================

/**
 * 将厘米转换为 DXA
 */
function cmToDxa(cm) {
    return Math.round(cm * DXA_PER_CM);
}

/**
 * 将英寸转换为 DXA
 */
function inchToDxa(inches) {
    return Math.round(inches * DXA_PER_INCH);
}

/**
 * 将磅转换为半磅（docx-js run.size 单位）
 */
function ptToHalfPt(pt) {
    return Math.round(pt * HALF_POINTS_PER_PT);
}

/**
 * 将磅转换为缇（twips，段落间距单位）
 */
function ptToTwips(pt) {
    return Math.round(pt * TWIPS_PER_PT);
}

/**
 * 将行距倍数转换为 docx-js spacing.line 值（240 = 单倍行距）
 */
function lineSpacingToValue(multiplier) {
    return Math.round(multiplier * 240);
}

/**
 * 解析边距值，支持厘米（默认）和英寸
 */
function parseMargin(value, unit) {
    if (unit === "inch" || unit === "inches" || unit === "in") {
        return inchToDxa(value);
    }
    // 默认厘米
    return cmToDxa(value);
}

/**
 * 解析颜色值，确保为 6 位十六进制
 */
function parseColor(color) {
    if (!color) return undefined;
    // 去掉 # 前缀
    const c = String(color).replace(/^#/, "");
    return c.toUpperCase();
}

/**
 * 获取图片类型
 */
function getImageType(filePath) {
    const ext = path.extname(filePath).toLowerCase().replace(".", "");
    const typeMap = { "jpg": "jpg", "jpeg": "jpg", "png": "png", "gif": "gif", "bmp": "bmp", "svg": "svg" };
    return typeMap[ext] || "png";
}

// ============================================================
// 构建器函数
// ============================================================

/**
 * 构建 TextRun 的属性对象
 */
function buildRunOptions(item) {
    const opts = {};

    if (item.text !== undefined) opts.text = item.text;
    if (item.font) opts.font = item.font;
    if (item.size) opts.size = ptToHalfPt(item.size);
    if (item.bold) opts.bold = true;
    if (item.italic) opts.italic = true;
    if (item.underline) {
        opts.underline = typeof item.underline === "string"
            ? { type: UNDERLINE_MAP[item.underline] || "single" }
            : { type: "single" };
    }
    if (item.strike) opts.strike = true;
    if (item.color) opts.color = parseColor(item.color);
    if (item.highlight) opts.highlight = item.highlight;
    if (item.superscript) opts.superScript = true;
    if (item.subscript) opts.subScript = true;
    if (item.style) opts.style = item.style;

    return opts;
}

/**
 * 构建段落的 children 数组（inline 元素）
 *
 * 支持的 inline 类型：
 * - 纯字符串 → TextRun
 * - { type: "text", text: "...", bold: true, ... } → TextRun
 * - { type: "image", path: "...", width: N, height: N } → ImageRun
 * - { type: "link", text: "...", url: "..." } → ExternalHyperlink
 * - { type: "internal_link", text: "...", anchor: "..." } → InternalHyperlink
 * - { type: "bookmark", id: "...", text: "..." } → Bookmark
 * - { type: "footnote", id: N } → FootnoteReferenceRun
 * - { type: "page_break" } → PageBreak
 * - { type: "tab" } → 制表符 TextRun
 * - { type: "positional_tab", alignment: "right", leader: "dot" } → PositionalTab
 */
function buildInlineChildren(items, jsonDir) {
    if (!items) return [];
    // 如果是纯字符串，直接包装
    if (typeof items === "string") {
        return [new TextRun(items)];
    }
    if (!Array.isArray(items)) {
        return [new TextRun(String(items))];
    }

    return items.map(item => {
        // 纯字符串
        if (typeof item === "string") {
            return new TextRun(item);
        }

        const type = (item.type || "text").toLowerCase();

        switch (type) {
            case "text": {
                return new TextRun(buildRunOptions(item));
            }

            case "image": {
                const imgPath = path.isAbsolute(item.path)
                    ? item.path
                    : path.resolve(jsonDir, item.path);
                const imgData = fs.readFileSync(imgPath);
                const imgType = getImageType(imgPath);
                const opts = {
                    type: imgType,
                    data: imgData,
                    transformation: {
                        width: item.width || 200,
                        height: item.height || 150,
                    },
                    altText: {
                        title: item.alt_title || item.title || "Image",
                        description: item.alt_description || item.description || "Image",
                        name: item.alt_name || item.name || "image",
                    },
                };
                return new ImageRun(opts);
            }

            case "link":
            case "external_link": {
                const linkChildren = [];
                if (item.children) {
                    linkChildren.push(...buildInlineChildren(item.children, jsonDir));
                } else {
                    linkChildren.push(new TextRun({
                        text: item.text || item.url,
                        style: "Hyperlink",
                    }));
                }
                return new ExternalHyperlink({
                    children: linkChildren,
                    link: item.url || item.link,
                });
            }

            case "internal_link": {
                const linkChildren = [];
                if (item.children) {
                    linkChildren.push(...buildInlineChildren(item.children, jsonDir));
                } else {
                    linkChildren.push(new TextRun({
                        text: item.text || item.anchor,
                        style: "Hyperlink",
                    }));
                }
                return new InternalHyperlink({
                    children: linkChildren,
                    anchor: item.anchor,
                });
            }

            case "bookmark": {
                const bmChildren = item.text
                    ? [new TextRun(typeof item.text === "string" ? item.text : buildRunOptions(item.text))]
                    : buildInlineChildren(item.children || [], jsonDir);
                return new Bookmark({
                    id: item.id,
                    children: bmChildren,
                });
            }

            case "footnote": {
                return new FootnoteReferenceRun(item.id);
            }

            case "page_break": {
                return new PageBreak();
            }

            case "tab": {
                return new TextRun("\t");
            }

            case "positional_tab": {
                const ptAlignMap = {
                    "left": PositionalTabAlignment.LEFT,
                    "center": PositionalTabAlignment.CENTER,
                    "right": PositionalTabAlignment.RIGHT,
                };
                const ptLeaderMap = {
                    "none": PositionalTabLeader.NONE,
                    "dot": PositionalTabLeader.DOT,
                    "hyphen": PositionalTabLeader.HYPHEN,
                    "underscore": PositionalTabLeader.UNDERSCORE,
                    "middleDot": PositionalTabLeader.MIDDLE_DOT,
                };
                return new TextRun({
                    children: [
                        new PositionalTab({
                            alignment: ptAlignMap[item.alignment] || PositionalTabAlignment.RIGHT,
                            relativeTo: PositionalTabRelativeTo.MARGIN,
                            leader: ptLeaderMap[item.leader] || PositionalTabLeader.NONE,
                        }),
                        ...(item.text ? [item.text] : []),
                    ],
                });
            }

            default:
                return new TextRun(item.text || "");
        }
    });
}

/**
 * 构建段落属性
 */
function buildParagraphOptions(item, jsonDir, numberingConfigs) {
    const opts = {};

    // 标题级别
    if (item.heading || item.level) {
        const level = item.heading || item.level;
        if (HEADING_LEVEL_MAP[level]) {
            opts.heading = HEADING_LEVEL_MAP[level];
        }
    }

    // 样式
    if (item.style) opts.style = item.style;

    // 对齐
    if (item.align) {
        opts.alignment = ALIGNMENT_MAP[item.align] || AlignmentType.LEFT;
    }

    // 间距
    if (item.spacing_before || item.spacing_after || item.line_spacing) {
        opts.spacing = {};
        if (item.spacing_before) opts.spacing.before = ptToTwips(item.spacing_before);
        if (item.spacing_after) opts.spacing.after = ptToTwips(item.spacing_after);
        if (item.line_spacing) {
            opts.spacing.line = lineSpacingToValue(item.line_spacing);
            opts.spacing.lineRule = "auto";
        }
    }

    // 缩进
    if (item.indent || item.indent_first_line || item.indent_left || item.indent_right) {
        opts.indent = {};
        if (item.indent_first_line) {
            // 默认按字符数 * 240 缇
            opts.indent.firstLine = typeof item.indent_first_line === "number"
                ? Math.round(item.indent_first_line * 240)
                : 480; // 默认 2 个字符
        }
        if (item.indent_left) opts.indent.left = cmToDxa(item.indent_left);
        if (item.indent_right) opts.indent.right = cmToDxa(item.indent_right);
        if (item.indent) opts.indent.left = cmToDxa(item.indent);
    }

    // 段前分页
    if (item.page_break_before) opts.pageBreakBefore = true;

    // 制表位
    if (item.tab_stops) {
        const tsTypeMap = {
            "left": TabStopType.LEFT,
            "center": TabStopType.CENTER,
            "right": TabStopType.RIGHT,
        };
        opts.tabStops = item.tab_stops.map(ts => ({
            type: tsTypeMap[ts.type] || TabStopType.LEFT,
            position: ts.position === "max" ? TabStopPosition.MAX : ts.position,
        }));
    }

    // 边框（段落底部线等）
    if (item.border) {
        opts.border = {};
        for (const side of ["top", "bottom", "left", "right"]) {
            if (item.border[side]) {
                opts.border[side] = {
                    style: BorderStyle.SINGLE,
                    size: item.border[side].size || 6,
                    color: parseColor(item.border[side].color) || "000000",
                    space: item.border[side].space || 1,
                };
            }
        }
    }

    // 列表编号
    if (item.numbering) {
        opts.numbering = {
            reference: item.numbering.reference || item.numbering.ref,
            level: item.numbering.level || 0,
        };
    }

    // 构建 children
    opts.children = buildInlineChildren(item.children || item.text, jsonDir);

    return opts;
}

/**
 * 构建表格边框对象
 */
function buildTableBorders(borderDef) {
    if (!borderDef) {
        // 默认边框
        const defaultBorder = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
        return {
            top: defaultBorder,
            bottom: defaultBorder,
            left: defaultBorder,
            right: defaultBorder,
            insideHorizontal: defaultBorder,
            insideVertical: defaultBorder,
        };
    }
    if (borderDef === "none" || borderDef === false) {
        const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        return {
            top: noBorder,
            bottom: noBorder,
            left: noBorder,
            right: noBorder,
            insideHorizontal: noBorder,
            insideVertical: noBorder,
        };
    }
    // 自定义边框
    const makeBorder = (def) => ({
        style: BorderStyle.SINGLE,
        size: def.size || 1,
        color: parseColor(def.color) || "CCCCCC",
    });
    const b = typeof borderDef === "object" ? borderDef : {};
    const defaultB = makeBorder(b.all || b);
    return {
        top: b.top ? makeBorder(b.top) : defaultB,
        bottom: b.bottom ? makeBorder(b.bottom) : defaultB,
        left: b.left ? makeBorder(b.left) : defaultB,
        right: b.right ? makeBorder(b.right) : defaultB,
        insideHorizontal: b.insideH ? makeBorder(b.insideH) : defaultB,
        insideVertical: b.insideV ? makeBorder(b.insideV) : defaultB,
    };
}

/**
 * 构建单元格
 */
function buildTableCell(cellDef, cellWidth, borders, jsonDir) {
    const opts = {};

    // 宽度
    if (cellWidth) {
        opts.width = { size: cellWidth, type: WidthType.DXA };
    }

    // 边框
    opts.borders = {
        top: borders.top,
        bottom: borders.bottom,
        left: borders.left,
        right: borders.right,
    };

    // 内边距
    opts.margins = cellDef.margins || { top: 80, bottom: 80, left: 120, right: 120 };

    // 底纹
    if (cellDef.shading || cellDef.fill) {
        opts.shading = {
            fill: parseColor(cellDef.shading || cellDef.fill),
            type: ShadingType.CLEAR,
        };
    }

    // 垂直对齐
    if (cellDef.vertical_align) {
        const vaMap = { "top": VerticalAlign.TOP, "center": VerticalAlign.CENTER, "bottom": VerticalAlign.BOTTOM };
        opts.verticalAlign = vaMap[cellDef.vertical_align] || VerticalAlign.TOP;
    }

    // 合并
    if (cellDef.column_span) opts.columnSpan = cellDef.column_span;
    if (cellDef.row_span) opts.rowSpan = cellDef.row_span;

    // 内容
    if (cellDef.children && Array.isArray(cellDef.children)) {
        opts.children = cellDef.children.map(child => {
            if (typeof child === "string") {
                return new Paragraph({ children: [new TextRun(child)] });
            }
            if (child.type === "paragraph" || !child.type) {
                return new Paragraph(buildParagraphOptions(child, jsonDir));
            }
            // 默认当文本处理
            return new Paragraph({ children: [new TextRun(child.text || String(child))] });
        });
    } else {
        // 简单文本
        const text = typeof cellDef === "string" ? cellDef : (cellDef.text || "");
        const runOpts = {};
        if (typeof cellDef === "object") {
            if (cellDef.bold) runOpts.bold = true;
            if (cellDef.font) runOpts.font = cellDef.font;
            if (cellDef.size) runOpts.size = ptToHalfPt(cellDef.size);
            if (cellDef.color) runOpts.color = parseColor(cellDef.color);
        }
        runOpts.text = text;
        const paraOpts = { children: [new TextRun(runOpts)] };
        if (typeof cellDef === "object" && cellDef.align) {
            paraOpts.alignment = ALIGNMENT_MAP[cellDef.align] || AlignmentType.LEFT;
        }
        opts.children = [new Paragraph(paraOpts)];
    }

    return new TableCell(opts);
}

/**
 * 构建表格
 *
 * JSON 格式：
 * {
 *   type: "table",
 *   headers: ["列1", "列2"],           // 可选，表头行
 *   rows: [["A", "B"], ["C", "D"]],    // 数据行
 *   column_widths: [4680, 4680],        // 可选，DXA 单位
 *   width: 9360,                        // 可选，表格总宽度 DXA
 *   border: { ... },                    // 可选，边框配置
 *   header_shading: "D5E8F0",           // 可选，表头底纹
 *   cell_margins: { ... },              // 可选，全局单元格内边距
 * }
 */
function buildTable(tableDef, jsonDir, contentWidth) {
    const colCount = tableDef.headers
        ? tableDef.headers.length
        : (tableDef.rows && tableDef.rows[0] ? tableDef.rows[0].length : 2);

    // 表格宽度
    const tableWidth = tableDef.width || contentWidth || 9360;

    // 列宽
    let columnWidths = tableDef.column_widths;
    if (!columnWidths) {
        const colW = Math.floor(tableWidth / colCount);
        columnWidths = Array(colCount).fill(colW);
        // 修正余数
        const remainder = tableWidth - colW * colCount;
        if (remainder > 0) columnWidths[colCount - 1] += remainder;
    }

    // 边框
    const borders = buildTableBorders(tableDef.border);

    const rows = [];

    // 表头行
    if (tableDef.headers) {
        const headerCells = tableDef.headers.map((h, i) => {
            const cellDef = typeof h === "string" ? { text: h, bold: true } : { ...h, bold: true };
            if (tableDef.header_shading) {
                cellDef.shading = tableDef.header_shading;
            }
            if (tableDef.cell_margins) cellDef.margins = tableDef.cell_margins;
            return buildTableCell(cellDef, columnWidths[i], borders, jsonDir);
        });
        rows.push(new TableRow({ children: headerCells, tableHeader: true }));
    }

    // 数据行
    if (tableDef.rows) {
        for (const row of tableDef.rows) {
            const cells = (Array.isArray(row) ? row : row.cells || []).map((cell, i) => {
                const cellDef = typeof cell === "string" ? { text: cell } : cell;
                if (tableDef.cell_margins && typeof cellDef === "object" && !cellDef.margins) {
                    cellDef.margins = tableDef.cell_margins;
                }
                return buildTableCell(cellDef, columnWidths[i], borders, jsonDir);
            });
            rows.push(new TableRow({ children: cells }));
        }
    }

    return new Table({
        width: { size: tableWidth, type: WidthType.DXA },
        columnWidths: columnWidths,
        rows: rows,
    });
}

/**
 * 构建列表项（项目符号或编号）
 *
 * JSON 格式：
 * {
 *   type: "list",
 *   style: "bullet" | "number",
 *   items: ["项目1", "项目2", { text: "项目3", children: [...] }],
 *   reference: "myList",  // 可选，自定义引用名
 * }
 */
function buildListItems(listDef, jsonDir) {
    const ref = listDef.reference || (listDef.style === "number" ? "default-numbering" : "default-bullets");
    const items = listDef.items || [];

    return items.map(item => {
        if (typeof item === "string") {
            return new Paragraph({
                numbering: { reference: ref, level: 0 },
                children: [new TextRun(item)],
            });
        }
        // 对象形式
        const level = item.level || 0;
        const paraOpts = buildParagraphOptions(item, jsonDir);
        paraOpts.numbering = { reference: ref, level: level };
        return new Paragraph(paraOpts);
    });
}

/**
 * 构建内容元素（递归处理 content 数组）
 *
 * 返回 Paragraph / Table 等元素的数组
 */
function buildContentElements(content, jsonDir, numberingConfigs, contentWidth) {
    if (!content || !Array.isArray(content)) return [];

    const elements = [];

    for (const item of content) {
        const type = (item.type || "paragraph").toLowerCase();

        switch (type) {
            case "heading": {
                const level = item.level || 1;
                const paraOpts = {
                    heading: HEADING_LEVEL_MAP[level] || HeadingLevel.HEADING_1,
                    children: buildInlineChildren(item.children || item.text, jsonDir),
                };
                if (item.align) paraOpts.alignment = ALIGNMENT_MAP[item.align];
                if (item.spacing_before || item.spacing_after) {
                    paraOpts.spacing = {};
                    if (item.spacing_before) paraOpts.spacing.before = ptToTwips(item.spacing_before);
                    if (item.spacing_after) paraOpts.spacing.after = ptToTwips(item.spacing_after);
                }
                // 支持书签
                if (item.bookmark_id) {
                    paraOpts.children = [
                        new Bookmark({
                            id: item.bookmark_id,
                            children: buildInlineChildren(item.children || item.text, jsonDir),
                        }),
                    ];
                }
                elements.push(new Paragraph(paraOpts));
                break;
            }

            case "paragraph":
            case "p": {
                elements.push(new Paragraph(buildParagraphOptions(item, jsonDir, numberingConfigs)));
                break;
            }

            case "table": {
                elements.push(buildTable(item, jsonDir, contentWidth));
                break;
            }

            case "list": {
                const listItems = buildListItems(item, jsonDir);
                elements.push(...listItems);
                break;
            }

            case "image":
            case "img": {
                const imgPath = path.isAbsolute(item.path)
                    ? item.path
                    : path.resolve(jsonDir, item.path);
                const imgData = fs.readFileSync(imgPath);
                const imgType = getImageType(imgPath);
                const paraOpts = {
                    children: [new ImageRun({
                        type: imgType,
                        data: imgData,
                        transformation: {
                            width: item.width || 200,
                            height: item.height || 150,
                        },
                        altText: {
                            title: item.alt_title || item.title || "Image",
                            description: item.alt_description || item.description || "Image",
                            name: item.alt_name || item.name || "image",
                        },
                    })],
                };
                if (item.align) paraOpts.alignment = ALIGNMENT_MAP[item.align];
                elements.push(new Paragraph(paraOpts));
                break;
            }

            case "page_break": {
                elements.push(new Paragraph({ children: [new PageBreak()] }));
                break;
            }

            case "toc":
            case "table_of_contents": {
                elements.push(
                    new TableOfContents(item.title || "Table of Contents", {
                        hyperlink: item.hyperlink !== false,
                        headingStyleRange: item.heading_range || "1-3",
                    })
                );
                break;
            }

            case "empty":
            case "blank": {
                // 空段落
                const count = item.count || 1;
                for (let i = 0; i < count; i++) {
                    elements.push(new Paragraph({}));
                }
                break;
            }

            default:
                // 未知类型当段落处理
                if (item.text) {
                    elements.push(new Paragraph({
                        children: [new TextRun(item.text)],
                    }));
                }
                break;
        }
    }

    return elements;
}

/**
 * 构建页眉
 */
function buildHeader(headerDef, jsonDir) {
    if (!headerDef) return undefined;

    let children;
    if (typeof headerDef === "string") {
        children = [new Paragraph({ children: [new TextRun(headerDef)] })];
    } else if (headerDef.content) {
        children = buildContentElements(headerDef.content, jsonDir);
    } else {
        const paraOpts = {};
        paraOpts.children = [];

        if (headerDef.text) {
            paraOpts.children.push(new TextRun(
                typeof headerDef.text === "string"
                    ? headerDef.text
                    : buildRunOptions(headerDef.text)
            ));
        }

        if (headerDef.align) {
            paraOpts.alignment = ALIGNMENT_MAP[headerDef.align];
        }

        // 支持左右分栏（左文本 + 右文本，用制表位实现）
        if (headerDef.left && headerDef.right) {
            paraOpts.children = [
                new TextRun(headerDef.left),
                new TextRun("\t"),
                new TextRun(headerDef.right),
            ];
            paraOpts.tabStops = [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }];
        }

        // 底部边框线
        if (headerDef.border_bottom !== false) {
            paraOpts.border = {
                bottom: {
                    style: BorderStyle.SINGLE,
                    size: headerDef.border_size || 6,
                    color: parseColor(headerDef.border_color) || "2E75B6",
                    space: 1,
                },
            };
        }

        children = [new Paragraph(paraOpts)];
    }

    return new Header({ children });
}

/**
 * 构建页脚
 */
function buildFooter(footerDef, jsonDir) {
    if (!footerDef) return undefined;

    let children;
    if (typeof footerDef === "string") {
        children = [new Paragraph({ children: [new TextRun(footerDef)] })];
    } else if (footerDef.content) {
        children = buildContentElements(footerDef.content, jsonDir);
    } else {
        const paraOpts = {};
        paraOpts.children = [];

        // 页码
        if (footerDef.page_number) {
            const prefix = footerDef.page_number_prefix || "第 ";
            const suffix = footerDef.page_number_suffix || " 页";
            paraOpts.children = [
                new TextRun(prefix),
                new TextRun({ children: [PageNumber.CURRENT] }),
                new TextRun(suffix),
            ];
            paraOpts.alignment = ALIGNMENT_MAP[footerDef.align] || AlignmentType.CENTER;
        } else if (footerDef.text) {
            paraOpts.children.push(new TextRun(
                typeof footerDef.text === "string"
                    ? footerDef.text
                    : buildRunOptions(footerDef.text)
            ));
            if (footerDef.align) {
                paraOpts.alignment = ALIGNMENT_MAP[footerDef.align];
            }
        }

        // 支持左右分栏
        if (footerDef.left && footerDef.right) {
            paraOpts.children = [
                new TextRun(footerDef.left),
                new TextRun("\t"),
                new TextRun(footerDef.right),
            ];
            paraOpts.tabStops = [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }];
        }

        // 左文本 + 右页码
        if (footerDef.left && footerDef.page_number && !footerDef.right) {
            paraOpts.children = [
                new TextRun(footerDef.left),
                new TextRun({
                    children: [
                        new PositionalTab({
                            alignment: PositionalTabAlignment.RIGHT,
                            relativeTo: PositionalTabRelativeTo.MARGIN,
                            leader: PositionalTabLeader.NONE,
                        }),
                        "第 ",
                    ],
                }),
                new TextRun({ children: [PageNumber.CURRENT] }),
                new TextRun(" 页"),
            ];
        }

        children = [new Paragraph(paraOpts)];
    }

    return new Footer({ children });
}

/**
 * 构建编号配置（列表）
 */
function buildNumberingConfig(numberingDef) {
    // 默认配置（始终添加，因为 content 中的 list 会引用它们）
    const configs = [];

    // 始终添加默认的 bullets 和 numbering
    configs.push({
        reference: "default-bullets",
        levels: [
            {
                level: 0,
                format: LevelFormat.BULLET,
                text: "\u2022",
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
            {
                level: 1,
                format: LevelFormat.BULLET,
                text: "\u25E6",
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
            },
            {
                level: 2,
                format: LevelFormat.BULLET,
                text: "\u25AA",
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 2160, hanging: 360 } } },
            },
        ],
    });

    configs.push({
        reference: "default-numbering",
        levels: [
            {
                level: 0,
                format: LevelFormat.DECIMAL,
                text: "%1.",
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
            {
                level: 1,
                format: LevelFormat.LOWER_LETTER,
                text: "%2)",
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
            },
            {
                level: 2,
                format: LevelFormat.LOWER_ROMAN,
                text: "%3.",
                alignment: AlignmentType.LEFT,
                style: { paragraph: { indent: { left: 2160, hanging: 360 } } },
            },
        ],
    });

    // 用户自定义编号
    if (numberingDef && Array.isArray(numberingDef)) {
        for (const nd of numberingDef) {
            const levels = (nd.levels || []).map(l => {
                const levelDef = {
                    level: l.level || 0,
                    format: l.format === "bullet" ? LevelFormat.BULLET
                        : l.format === "decimal" ? LevelFormat.DECIMAL
                        : l.format === "lower_letter" ? LevelFormat.LOWER_LETTER
                        : l.format === "upper_letter" ? LevelFormat.UPPER_LETTER
                        : l.format === "lower_roman" ? LevelFormat.LOWER_ROMAN
                        : l.format === "upper_roman" ? LevelFormat.UPPER_ROMAN
                        : LevelFormat.DECIMAL,
                    text: l.text || "%1.",
                    alignment: AlignmentType.LEFT,
                    style: {
                        paragraph: {
                            indent: {
                                left: l.indent_left || (l.level + 1) * 720,
                                hanging: l.hanging || 360,
                            },
                        },
                    },
                };
                return levelDef;
            });
            configs.push({
                reference: nd.reference,
                levels: levels,
            });
        }
    }

    return configs;
}

/**
 * 构建样式配置
 */
function buildStyles(stylesDef) {
    if (!stylesDef) return undefined;

    const result = {};

    // 默认样式
    if (stylesDef.default) {
        result.default = {
            document: {
                run: {
                    font: stylesDef.default.font || "Arial",
                    size: ptToHalfPt(stylesDef.default.size || 12),
                },
            },
        };
        if (stylesDef.default.color) {
            result.default.document.run.color = parseColor(stylesDef.default.color);
        }
    }

    // 段落样式（标题等）
    const paragraphStyles = [];

    // 处理 heading1 ~ heading6
    for (let i = 1; i <= 6; i++) {
        const key = `heading${i}`;
        const altKey = `heading_${i}`;
        const hDef = stylesDef[key] || stylesDef[altKey];
        if (hDef) {
            const styleDef = {
                id: `Heading${i}`,
                name: `Heading ${i}`,
                basedOn: "Normal",
                next: "Normal",
                quickFormat: true,
                run: {},
                paragraph: {
                    spacing: {
                        before: hDef.spacing_before ? ptToTwips(hDef.spacing_before) : (i === 1 ? 240 : 180),
                        after: hDef.spacing_after ? ptToTwips(hDef.spacing_after) : (i === 1 ? 240 : 180),
                    },
                    outlineLevel: i - 1,
                },
            };
            if (hDef.font) styleDef.run.font = hDef.font;
            if (hDef.size) styleDef.run.size = ptToHalfPt(hDef.size);
            if (hDef.bold !== false) styleDef.run.bold = true;
            if (hDef.italic) styleDef.run.italic = true;
            if (hDef.color) styleDef.run.color = parseColor(hDef.color);
            paragraphStyles.push(styleDef);
        }
    }

    // 自定义样式
    if (stylesDef.custom && Array.isArray(stylesDef.custom)) {
        for (const cs of stylesDef.custom) {
            const styleDef = {
                id: cs.id,
                name: cs.name || cs.id,
                basedOn: cs.based_on || "Normal",
                next: cs.next || "Normal",
                quickFormat: cs.quick_format !== false,
                run: {},
                paragraph: {},
            };
            if (cs.font) styleDef.run.font = cs.font;
            if (cs.size) styleDef.run.size = ptToHalfPt(cs.size);
            if (cs.bold) styleDef.run.bold = true;
            if (cs.italic) styleDef.run.italic = true;
            if (cs.color) styleDef.run.color = parseColor(cs.color);
            if (cs.align) styleDef.paragraph.alignment = ALIGNMENT_MAP[cs.align];
            if (cs.spacing_before || cs.spacing_after) {
                styleDef.paragraph.spacing = {};
                if (cs.spacing_before) styleDef.paragraph.spacing.before = ptToTwips(cs.spacing_before);
                if (cs.spacing_after) styleDef.paragraph.spacing.after = ptToTwips(cs.spacing_after);
            }
            paragraphStyles.push(styleDef);
        }
    }

    if (paragraphStyles.length > 0) {
        result.paragraphStyles = paragraphStyles;
    }

    return result;
}

/**
 * 构建多栏配置
 */
function buildColumnConfig(columnDef) {
    if (!columnDef) return undefined;

    if (columnDef.equal_width !== false && !columnDef.columns) {
        return {
            count: columnDef.count || 2,
            space: columnDef.space || 720,
            equalWidth: true,
            separate: columnDef.separate || false,
        };
    }

    // 自定义宽度
    return {
        equalWidth: false,
        children: (columnDef.columns || []).map(col =>
            new Column({ width: col.width, space: col.space || 720 })
        ),
    };
}

/**
 * 构建 section 配置
 */
function buildSection(sectionDef, jsonDir, numberingConfigs) {
    const section = {};

    // 页面属性
    const props = {};

    // 页面大小
    const pageDef = sectionDef.page || {};
    const sizeName = (pageDef.size || "a4").toLowerCase();
    const pageSize = PAGE_SIZES[sizeName] || PAGE_SIZES["a4"];

    props.page = {
        size: {
            width: pageDef.width || pageSize.width,
            height: pageDef.height || pageSize.height,
        },
    };

    // 横向
    if (pageDef.orientation === "landscape") {
        props.page.size.orientation = PageOrientation.LANDSCAPE;
    }

    // 页边距
    const marginDef = pageDef.margin || {};
    const marginUnit = pageDef.margin_unit || "cm";
    props.page.margin = {
        top: marginDef.top ? parseMargin(marginDef.top, marginUnit) : DXA_PER_INCH,
        bottom: marginDef.bottom ? parseMargin(marginDef.bottom, marginUnit) : DXA_PER_INCH,
        left: marginDef.left ? parseMargin(marginDef.left, marginUnit) : DXA_PER_INCH,
        right: marginDef.right ? parseMargin(marginDef.right, marginUnit) : DXA_PER_INCH,
    };

    // 计算内容宽度（用于表格自动宽度）
    const effectiveWidth = pageDef.orientation === "landscape"
        ? (pageDef.height || pageSize.height)
        : (pageDef.width || pageSize.width);
    const contentWidth = effectiveWidth - props.page.margin.left - props.page.margin.right;

    // 多栏
    if (sectionDef.columns) {
        props.column = buildColumnConfig(sectionDef.columns);
    }

    // 分节类型
    if (sectionDef.section_type) {
        const stMap = {
            "next_page": SectionType.NEXT_PAGE,
            "next_column": SectionType.NEXT_COLUMN,
            "continuous": SectionType.CONTINUOUS,
            "even_page": SectionType.EVEN_PAGE,
            "odd_page": SectionType.ODD_PAGE,
        };
        props.type = stMap[sectionDef.section_type];
    }

    section.properties = props;

    // 页眉
    if (sectionDef.header) {
        section.headers = {
            default: buildHeader(sectionDef.header, jsonDir),
        };
        if (sectionDef.header_first) {
            section.headers.first = buildHeader(sectionDef.header_first, jsonDir);
        }
    }

    // 页脚
    if (sectionDef.footer) {
        section.footers = {
            default: buildFooter(sectionDef.footer, jsonDir),
        };
        if (sectionDef.footer_first) {
            section.footers.first = buildFooter(sectionDef.footer_first, jsonDir);
        }
    }

    // 内容
    section.children = buildContentElements(
        sectionDef.content || [],
        jsonDir,
        numberingConfigs,
        contentWidth
    );

    return section;
}

// ============================================================
// 主函数
// ============================================================

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.error("用法: node create_doc.js <json_file> <output_file>");
        console.error("");
        console.error("  json_file   - JSON 描述文件路径");
        console.error("  output_file - 输出 .docx 文件路径");
        process.exit(1);
    }

    const jsonFile = args[0];
    const outputFile = args[1];

    // 读取 JSON
    if (!fs.existsSync(jsonFile)) {
        console.error(`错误: JSON 文件不存在: ${jsonFile}`);
        process.exit(1);
    }

    const jsonDir = path.dirname(path.resolve(jsonFile));
    let spec;
    try {
        const raw = fs.readFileSync(jsonFile, "utf-8");
        spec = JSON.parse(raw);
    } catch (e) {
        console.error(`错误: 解析 JSON 文件失败: ${e.message}`);
        process.exit(1);
    }

    // 构建文档配置
    const docOptions = {};

    // 样式
    const styles = buildStyles(spec.styles);
    if (styles) docOptions.styles = styles;

    // 编号（列表）
    const numberingConfigs = buildNumberingConfig(spec.numbering);
    if (numberingConfigs.length > 0) {
        docOptions.numbering = { config: numberingConfigs };
    }

    // 脚注
    if (spec.footnotes) {
        const footnotes = {};
        for (const [id, content] of Object.entries(spec.footnotes)) {
            if (typeof content === "string") {
                footnotes[Number(id)] = {
                    children: [new Paragraph(content)],
                };
            } else if (Array.isArray(content)) {
                footnotes[Number(id)] = {
                    children: content.map(c =>
                        typeof c === "string" ? new Paragraph(c) : new Paragraph(buildParagraphOptions(c, jsonDir))
                    ),
                };
            } else {
                footnotes[Number(id)] = {
                    children: [new Paragraph(buildParagraphOptions(content, jsonDir))],
                };
            }
        }
        docOptions.footnotes = footnotes;
    }

    // 节（sections）
    if (spec.sections && Array.isArray(spec.sections)) {
        // 多节模式
        docOptions.sections = spec.sections.map(s => buildSection(s, jsonDir, numberingConfigs));
    } else {
        // 单节模式（兼容简化格式）
        const singleSection = {
            page: spec.page,
            header: spec.header,
            footer: spec.footer,
            header_first: spec.header_first,
            footer_first: spec.footer_first,
            content: spec.content,
            columns: spec.columns,
        };
        docOptions.sections = [buildSection(singleSection, jsonDir, numberingConfigs)];
    }

    // 创建文档
    const doc = new Document(docOptions);

    // 生成文件
    try {
        const buffer = await Packer.toBuffer(doc);
        // 确保输出目录存在
        const outputDir = path.dirname(path.resolve(outputFile));
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(outputFile, buffer);
        console.log(`文档已生成: ${outputFile}`);
    } catch (e) {
        console.error(`错误: 生成文档失败: ${e.message}`);
        console.error(e.stack);
        process.exit(1);
    }
}

main();
