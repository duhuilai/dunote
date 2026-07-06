# Table Operations Implementation

## Overview
Added comprehensive table row and column manipulation features to the table context menu, allowing users to insert and delete rows/columns directly from the right-click menu.

## Features Added

### Table Operations Menu Section
Located at the bottom of the table context menu, after cell background color picker.

### Available Operations

#### Row Operations
1. **上方插入行** (Insert Row Above)
   - Adds a new row above the current cursor position
   - Uses Tiptap's `addRowBefore()` command

2. **下方插入行** (Insert Row Below)
   - Adds a new row below the current cursor position
   - Uses Tiptap's `addRowAfter()` command

3. **删除行** (Delete Row)
   - Removes the row containing the current cursor position
   - Uses Tiptap's `deleteRow()` command

#### Column Operations
4. **左侧插入列** (Insert Column Left)
   - Adds a new column to the left of the current cursor position
   - Uses Tiptap's `addColumnBefore()` command

5. **右侧插入列** (Insert Column Right)
   - Adds a new column to the right of the current cursor position
   - Uses Tiptap's `addColumnAfter()` command

6. **删除列** (Delete Column)
   - Removes the column containing the current cursor position
   - Uses Tiptap's `deleteColumn()` command

#### Table Operations
7. **删除表格** (Delete Table)
   - Removes the entire table from the document
   - Uses Tiptap's `deleteTable()` command

## Implementation Details

### Code Structure
```tsx
<div>
  <div style={{ fontSize: '11px', color: C.textMuted, padding: '4px 8px', fontWeight: 600 }}>
    表格操作
  </div>
  {[
    { label: '上方插入行', action: () => editor.chain().focus().addRowBefore().run() },
    { label: '下方插入行', action: () => editor.chain().focus().addRowAfter().run() },
    { label: '左侧插入列', action: () => editor.chain().focus().addColumnBefore().run() },
    { label: '右侧插入列', action: () => editor.chain().focus().addColumnAfter().run() },
    { label: '删除行', action: () => editor.chain().focus().deleteRow().run() },
    { label: '删除列', action: () => editor.chain().focus().deleteColumn().run() },
    { label: '删除表格', action: () => editor.chain().focus().deleteTable().run() },
  ].map(({ label, action }) => (
    <button
      key={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        action()
        setShowTableContextMenu(false)
      }}
      // ... styling
    >
      {label}
    </button>
  ))}
</div>
```

### Key Design Decisions

1. **Array-based rendering**: All operations are defined in an array for easy maintenance and consistency
2. **Prevent default on mousedown**: Prevents editor focus loss before click executes (ProseMirror requirement)
3. **Auto-close menu**: Context menu closes automatically after executing any operation
4. **Consistent styling**: Matches existing menu items with hover effects and transitions

### Visual Design

- **Section header**: "表格操作" with muted gray color and bold weight
- **Divider**: Horizontal line separates this section from cell background colors
- **Button styling**: 
  - Full width with 8px horizontal padding
  - 7px border radius for rounded corners
  - Light gray hover background (#F8FAFC)
  - Smooth 0.15s transition

## User Workflow

### Inserting Rows/Columns
1. Right-click inside a table cell
2. Hover over desired operation (e.g., "下方插入行")
3. Click to execute
4. New row/column appears immediately
5. Menu closes automatically

### Deleting Rows/Columns/Table
1. Right-click inside the element to delete
2. Select the appropriate delete option
3. Element is removed instantly
4. Menu closes automatically

### Safety Considerations
- **Delete operations**: No confirmation dialog (matches standard editor behavior)
- **Undo support**: Users can use Ctrl+Z to undo accidental deletions
- **Visual feedback**: Immediate visual update confirms operation success

## Integration with Existing Features

The table operations complement existing table formatting features:
- **Text alignment**: Left, center, right alignment (top section)
- **Font family**: Multiple font options (middle section)
- **Font size**: Various size options (middle section)
- **Text color**: Color palette for text (middle section)
- **Cell background**: Background color grid (middle section)
- **Table operations**: Row/column management (new bottom section)

## Files Modified

1. **src/components/notes/NoteEditor.tsx**
   - Added table operations section to context menu
   - Implemented 7 table manipulation commands
   - Used array mapping for clean, maintainable code
   - Maintained consistent styling with existing menu items

## Tiptap Commands Used

All commands are provided by `@tiptap/extension-table`:
- `addRowBefore()` - Insert row before current position
- `addRowAfter()` - Insert row after current position
- `addColumnBefore()` - Insert column before current position
- `addColumnAfter()` - Insert column after current position
- `deleteRow()` - Delete current row
- `deleteColumn()` - Delete current column
- `deleteTable()` - Delete entire table

## Testing Checklist
- ✅ Build passes without errors
- ✅ TypeScript compilation successful
- ✅ All 7 operations execute correctly
- ✅ Context menu closes after operation
- ✅ Editor maintains focus properly
- ✅ Hover effects work as expected
- ✅ No console errors
- ✅ Undo functionality works (Ctrl+Z)

## Future Enhancements
Potential improvements for future iterations:
- Add "Merge cells" operation for selected cells
- Add "Split cell" operation for merged cells
- Add keyboard shortcuts for common operations
- Add table properties dialog (border width, padding, etc.)
- Support for table headers toggle
- Cell resizing handles in context menu
