import { useEffect, useState } from 'react';
import { useAppDataContext } from './hooks/AppDataContext';
import { TopBar } from './components/TopBar';
import { Toast } from './components/common/Toast';
import { ShelfView, getFilteredShelfItems } from './components/Shelf/ShelfView';
import { BookFormModal } from './components/Shelf/BookFormModal';
import { BookDetailModal } from './components/Shelf/BookDetailModal';
import { FilterPopup } from './components/FilterPopup';
import { RecipesView } from './components/Recipes/RecipesView';
import { RecipeEditorModal } from './components/Recipes/RecipeEditorModal';
import { RecipeViewModal } from './components/Recipes/RecipeViewModal';
import { CookSheetModal } from './components/Recipes/CookSheetModal';
import { GroceryView } from './components/Grocery/GroceryView';
import { PlanView } from './components/Plan/PlanView';
import { CsvImportModal } from './components/Csv/CsvImportModal';
import { BackupModal } from './components/Backup/BackupModal';
import { filterAndSortRecipeEntries } from './utils/recipeFilters';
import type { RecipeFilters, ShelfFilters, TabName } from './types';

const BLANK_RECIPE_FILTERS: RecipeFilters = { book: 'all', tags: [], status: 'all', rating: 0, sort: 'recent' };
const BLANK_SHELF_FILTERS: ShelfFilters = { status: 'all', sort: 'recent' };

interface CookSheetTarget { recipeId: string; planEntryId: string | null; }
interface RecipeEditorTarget { recipeId: string | null; bookId: string | null; }

export default function App() {
  const data = useAppDataContext();

  const [activeTab, setActiveTab] = useState<TabName>('shelf');
  const [searchTerm, setSearchTerm] = useState('');
  const [shelfFilters, setShelfFilters] = useState<ShelfFilters>(BLANK_SHELF_FILTERS);
  const [recipeFilters, setRecipeFilters] = useState<RecipeFilters>(BLANK_RECIPE_FILTERS);

  const [bookForm, setBookForm] = useState<{ bookId: string | null } | null>(null);
  const [detailBookId, setDetailBookId] = useState<string | null>(null);
  const [recipeEditor, setRecipeEditor] = useState<RecipeEditorTarget | null>(null);
  const [recipeViewId, setRecipeViewId] = useState<string | null>(null);
  const [cookSheet, setCookSheet] = useState<CookSheetTarget | null>(null);
  const [filterPopupOpen, setFilterPopupOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);

  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const flash = (message: string) => {
    setToast({ message });
    setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 2600);
  };

  // Escape closes whichever modal is topmost, same priority order as the original.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (filterPopupOpen) { setFilterPopupOpen(false); return; }
      if (cookSheet) { setCookSheet(null); return; }
      if (recipeEditor) { setRecipeEditor(null); return; }
      if (recipeViewId) { setRecipeViewId(null); return; }
      if (bookForm) { setBookForm(null); return; }
      if (detailBookId) { setDetailBookId(null); return; }
      if (csvOpen) { setCsvOpen(false); return; }
      if (backupOpen) { setBackupOpen(false); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filterPopupOpen, cookSheet, recipeEditor, recipeViewId, bookForm, detailBookId, csvOpen, backupOpen]);

  if (!data.ready) {
    return <div id="loadingMsg" style={{ display: 'block' }}>Loading your shelf...</div>;
  }

  const entries = data.getAllRecipeEntries();
  const detailBook = detailBookId ? data.books.find((b) => b.id === detailBookId) || null : null;
  const viewEntry = recipeViewId ? data.locateRecipeEntry(recipeViewId) : null;
  const cookEntry = cookSheet ? data.locateRecipeEntry(cookSheet.recipeId) : null;
  const editingEntry = recipeEditor?.recipeId ? data.locateRecipeEntry(recipeEditor.recipeId) : null;
  const editingBook = bookForm?.bookId ? data.books.find((b) => b.id === bookForm.bookId) || null : null;

  const handleAddButtonClick = () => {
    if (activeTab === 'recipes') setRecipeEditor({ recipeId: null, bookId: null });
    else if (activeTab === 'grocery') document.getElementById('g-new')?.focus();
    else if (activeTab === 'plan') setActiveTab('recipes');
    else setBookForm({ bookId: null });
  };

  const doAddToGrocery = async (recipeId: string) => {
    const result = await data.addRecipeToGrocery(recipeId);
    if (!result) { flash("This recipe doesn't have ingredients yet — add them in the editor and they'll flow straight onto your list."); return; }
    flash(`${result.added} item${result.added === 1 ? '' : 's'} added to your grocery list${result.merged ? `, ${result.merged} merged` : ''}.`);
  };

  const doAddToPlan = async (recipeId: string) => {
    const name = data.locateRecipeEntry(recipeId)?.recipe.name || 'Recipe';
    const { addedIngredients } = await data.addToMealPlan(recipeId);
    flash(`${name} added to this week${addedIngredients ? ' — ingredients are on your grocery list' : ''}.`);
  };

  const shelfResultCount = getFilteredShelfItems(data.books, shelfFilters, searchTerm).length;
  const recipeResultCount = filterAndSortRecipeEntries(entries, recipeFilters, searchTerm).length;

  return (
    <>
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        bookCount={data.books.length}
        onOpenBackup={() => setBackupOpen(true)}
        onOpenCsv={() => setCsvOpen(true)}
      />

      <Toast
        message={data.saveError ? "Couldn't save your changes." : toast?.message || null}
        isError={data.saveError || toast?.isError}
        onRetry={data.saveError ? data.retrySave : undefined}
        onDismiss={() => { setToast(null); }}
      />

      {activeTab === 'shelf' && (
        <ShelfView
          books={data.books}
          filters={shelfFilters}
          searchTerm={searchTerm}
          onOpenBook={setDetailBookId}
          onAddFirst={() => setBookForm({ bookId: null })}
        />
      )}

      {activeTab === 'recipes' && (
        <RecipesView
          entries={entries}
          filters={recipeFilters}
          searchTerm={searchTerm}
          planEntries={data.mealPlan.entries}
          onOpenRecipe={setRecipeViewId}
          onCookRecipe={(id) => setCookSheet({ recipeId: id, planEntryId: null })}
          onPlanRecipe={doAddToPlan}
          onClearFilters={() => { setRecipeFilters(BLANK_RECIPE_FILTERS); setSearchTerm(''); }}
          onAddRecipe={() => setRecipeEditor({ recipeId: null, bookId: null })}
        />
      )}

      {activeTab === 'plan' && (
        <PlanView
          plan={data.mealPlan}
          getEntry={data.locateRecipeEntry}
          onOpenRecipe={setRecipeViewId}
          onCook={(entryId, recipeId) => setCookSheet({ recipeId, planEntryId: entryId })}
          onRemove={data.removePlanEntry}
          onSetDay={data.setPlanDay}
          onStartNewWeek={data.startNewWeek}
          onSendToGrocery={async () => { const n = await data.sendWeekToGrocery(); flash(n ? `Ingredients from ${n} recipe${n === 1 ? '' : 's'} added to your grocery list.` : "None of this week's recipes have ingredients yet."); }}
          onBrowseRecipes={() => setActiveTab('recipes')}
        />
      )}

      {activeTab === 'grocery' && (
        <GroceryView
          items={data.grocery}
          onAdd={data.addManualGroceryItem}
          onToggle={data.toggleGroceryItem}
          onDelete={data.deleteGroceryItem}
          onClearChecked={data.clearCheckedGrocery}
          onClearAll={data.clearAllGrocery}
        />
      )}

      {(activeTab === 'shelf' || activeTab === 'recipes') && (
        <div className="bottombar">
          <div className="searchwrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <input type="text" placeholder={activeTab === 'shelf' ? 'Search your shelf...' : 'Search recipes, books, tags...'} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <button className="filterbtn" onClick={() => setFilterPopupOpen(true)} aria-label="Filters">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 5h18" /><path d="M6 12h12" /><path d="M10 19h4" />
            </svg>
          </button>
        </div>
      )}

      <button className="addbtn" onClick={handleAddButtonClick} aria-label="Add">+</button>

      <BookFormModal
        show={!!bookForm}
        editingBook={editingBook}
        onClose={() => setBookForm(null)}
        onSave={async (input) => { if (bookForm?.bookId) await data.editCookbook(bookForm.bookId, input); else await data.addCookbook(input); }}
      />

      <BookDetailModal
        show={!!detailBook}
        book={detailBook}
        onClose={() => setDetailBookId(null)}
        onEdit={() => { setBookForm({ bookId: detailBookId }); }}
        onDelete={() => { if (detailBookId && confirm(`Delete "${detailBook?.title}" and all its recipes? This can't be undone.`)) { data.removeCookbook(detailBookId); setDetailBookId(null); } }}
        onAddRecipe={() => setRecipeEditor({ recipeId: null, bookId: detailBookId })}
        onImportRecipes={async (recipes) => {
          if (!detailBook) return;
          await data.importCsvGroups([{ bookTitle: detailBook.title, author: detailBook.author, recipes, matchId: detailBook.id }]);
        }}
        onOpenRecipeView={setRecipeViewId}
        onOpenCookSheet={(id) => setCookSheet({ recipeId: id, planEntryId: null })}
        onDeleteRecipe={(id) => { if (confirm('Delete this recipe?')) data.removeRecipe(id); }}
      />

      <RecipeEditorModal
        show={!!recipeEditor}
        editingRecipe={editingEntry?.recipe || null}
        initialBookId={recipeEditor?.bookId ?? null}
        books={data.books}
        allTags={data.allTags()}
        onClose={() => setRecipeEditor(null)}
        onSave={async (cookbookId, input) => {
          if (editingEntry) await data.editRecipe(editingEntry.recipe.id, input);
          else await data.addRecipe(cookbookId, input);
        }}
        onDelete={editingEntry ? async (id) => { await data.removeRecipe(id); } : undefined}
      />

      <RecipeViewModal
        show={!!viewEntry}
        recipe={viewEntry?.recipe || null}
        book={viewEntry?.book || null}
        planEntries={data.mealPlan.entries}
        onClose={() => setRecipeViewId(null)}
        onCook={() => recipeViewId && setCookSheet({ recipeId: recipeViewId, planEntryId: null })}
        onAddToPlan={() => recipeViewId && doAddToPlan(recipeViewId)}
        onAddToGrocery={() => recipeViewId && doAddToGrocery(recipeViewId)}
        onEdit={() => { if (viewEntry) { setRecipeEditor({ recipeId: viewEntry.recipe.id, bookId: viewEntry.book?.id ?? null }); setRecipeViewId(null); } }}
        onToggleFlag={(flag) => recipeViewId && data.toggleRecipeFlag(recipeViewId, flag)}
        onDeleteSession={(sessionId) => data.deleteSession(sessionId)}
        onDeleteRecipe={() => { if (recipeViewId && confirm('Delete this recipe?')) { data.removeRecipe(recipeViewId); setRecipeViewId(null); } }}
      />

      <CookSheetModal
        show={!!cookSheet}
        recipe={cookEntry?.recipe || null}
        onClose={() => setCookSheet(null)}
        onSave={async (session) => { if (cookSheet) await data.cookRecipe(cookSheet.recipeId, session, cookSheet.planEntryId); }}
      />

      <FilterPopup
        show={filterPopupOpen}
        onClose={() => setFilterPopupOpen(false)}
        {...(activeTab === 'shelf'
          ? { mode: 'shelf' as const, filters: shelfFilters, onChange: setShelfFilters, onClear: () => { setShelfFilters(BLANK_SHELF_FILTERS); setSearchTerm(''); }, resultCount: shelfResultCount, totalCount: data.books.length }
          : { mode: 'recipes' as const, filters: recipeFilters, onChange: setRecipeFilters, onClear: () => { setRecipeFilters(BLANK_RECIPE_FILTERS); setSearchTerm(''); }, books: data.books, allTags: data.allTags(), resultCount: recipeResultCount, totalCount: entries.length })}
      />

      <CsvImportModal show={csvOpen} books={data.books} onClose={() => setCsvOpen(false)} onImport={data.importCsvGroups} />
      <BackupModal show={backupOpen} onClose={() => setBackupOpen(false)} onExport={data.exportBackup} onImport={data.importBackupJson} />
    </>
  );
}
