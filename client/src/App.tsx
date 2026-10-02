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
import { CollectionAnalysisModal } from './components/Analysis/CollectionAnalysisModal';
import type { RecipeFilters, ShelfFilters, TabName, AIRecipeSearchResult, WebSearchResult } from './types';
import { CalendarModal } from './components/Plan/CalendarModal';
import { PantryView } from './components/Pantry/PantryView';
import { MenuPlannerModal } from './components/Menu/MenuPlannerModal';

const BLANK_RECIPE_FILTERS: RecipeFilters = { book: 'all', tags: [], status: 'all', rating: 0, sort: 'recent' };
const BLANK_SHELF_FILTERS: ShelfFilters = { status: 'all', sort: 'recent' };

const AI_SEARCH_ENDPOINT = `${window.location.protocol}//${window.location.hostname}:8000/api/search/recipes`;

interface CookSheetTarget { recipeId: string; planEntryId: string | null; }
interface RecipeEditorTarget { recipeId: string | null; bookId: string | null; importUrl?: string | null; }

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
  const [calendarOpen, setCalendarOpen] = useState(false);

  // ---------------- AI recipe search ----------------
  const [aiMode, setAiMode] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResults, setAiResults] = useState<AIRecipeSearchResult[]>([]);
  const [webResults, setWebResults] = useState<WebSearchResult[]>([]);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [menuPlannerOpen, setMenuPlannerOpen] = useState(false);



  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const flash = (message: string) => {
    setToast({ message });
    setTimeout(() => setToast((t) => (t?.message === message ? null : t)), 2600);
  };

  const exitAiMode = () => {
    setAiMode(false);
    setAiResults([]);
    setWebResults([]);
    setAiError(null);
  };

  const runAiSearch = async () => {
    const query = searchTerm.trim();
    if (!query || aiLoading) return;

    setAiMode(true);
    setAiLoading(true);
    setAiError(null);
    setAiQuery(query);

    try {
      const entries = data.getAllRecipeEntries();
      const response = await fetch(AI_SEARCH_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          recipes: entries.map(({ recipe, book }) => {
            const history = recipe.cookingHistory || [];
            const last = history.length
              ? [...history].sort((a, b) => b.date.localeCompare(a.date))[0].date
              : null;
            return {
              id: recipe.id,
              name: recipe.name,
              ingredients: recipe.ingredients.map((ing) => `${ing.qty ?? ''} ${ing.unit ?? ''} ${ing.name ?? ''}`.trim()),
              tags: recipe.tags,
              rating: recipe.rating,
              cookbook: book?.title,
              times_cooked: history.length,
              last_cooked: last
            };
          }),
          limit: 30
        })
      });

      if (!response.ok) throw new Error(`Search failed (HTTP ${response.status})`);
      const responseData = await response.json();
      setAiResults(Array.isArray(responseData.results) ? responseData.results : []);
      setWebResults(Array.isArray(responseData.web_results) ? responseData.web_results : []);
    } catch (err: any) {
      setAiError(err.message || 'Could not search your cookbook.');
      setAiResults([]);
      setWebResults([]);
    } finally {
      setAiLoading(false);
    }
  };

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
      if (aiMode) { exitAiMode(); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filterPopupOpen, cookSheet, recipeEditor, recipeViewId, bookForm, detailBookId, csvOpen, backupOpen, aiMode]);

  useEffect(() => {
    if (activeTab === 'recipes') {
      window.scrollTo(0, 0);
    }
  }, [activeTab]);

  if (!data.ready) {
    return <div id="loadingMsg" style={{ display: 'block' }}>Loading your shelf...</div>;
  }

  const entries = data.getAllRecipeEntries() || [];
  const detailBook = detailBookId ? data.books.find((b) => b.id === detailBookId) || null : null;
  const viewEntry = recipeViewId ? data.locateRecipeEntry(recipeViewId) : null;
  const cookEntry = cookSheet ? data.locateRecipeEntry(cookSheet.recipeId) : null;
  const editingEntry = recipeEditor?.recipeId ? data.locateRecipeEntry(recipeEditor.recipeId) : null;
  const editingBook = bookForm?.bookId ? data.books.find((b) => b.id === bookForm.bookId) || null : null;

  const addMenuToPlan = async (recipeIds: string[]) => {
    for (const id of recipeIds) {
      await data.addToMealPlan(id);
    }
    flash(`${recipeIds.length} recipe${recipeIds.length === 1 ? '' : 's'} added to this week.`);
  };

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

  const shelfResultCount = getFilteredShelfItems(data.books || [], shelfFilters, searchTerm).length;
  const recipeResultCount = filterAndSortRecipeEntries(entries, recipeFilters, searchTerm).length;

  return (
    <>
      <TopBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        bookCount={data.books.length}
        onOpenBackup={() => setBackupOpen(true)}
        onOpenCsv={() => setCsvOpen(true)}
        onOpenAnalysis={() => setAnalysisOpen(true)}
        onOpenMenuPlanner={() => setMenuPlannerOpen(true)}
      />

      <Toast
        message={data.saveError ? "Couldn't save your changes." : toast?.message || null}
        isError={data.saveError || toast?.isError}
        onRetry={data.saveError ? data.retrySave : undefined}
        onDismiss={() => { setToast(null); }}
      />

      <ShelfView
        active={activeTab === 'shelf'}
        books={data.books}
        filters={shelfFilters}
        searchTerm={searchTerm}
        onOpenBook={setDetailBookId}
        onAddFirst={() => setBookForm({ bookId: null })}
      />

      {activeTab === 'recipes' && (
        <RecipesView
          entries={entries}
          filters={recipeFilters}
          searchTerm={searchTerm}
          planEntries={data.mealPlan?.entries || []}
          onOpenRecipe={setRecipeViewId}
          onCookRecipe={(id) => setCookSheet({ recipeId: id, planEntryId: null })}
          onPlanRecipe={doAddToPlan}
          onClearFilters={() => { setRecipeFilters(BLANK_RECIPE_FILTERS); setSearchTerm(''); }}
          onAddRecipe={() => setRecipeEditor({ recipeId: null, bookId: null })}
          onImportRecipe={(urlOrDraft: any) => {
            const url = typeof urlOrDraft === 'string' ? urlOrDraft : urlOrDraft?.sourceUrl;
            setRecipeEditor({ recipeId: null, bookId: null, importUrl: url || null });
          }}
          aiMode={aiMode}
          aiLoading={aiLoading}
          aiError={aiError}
          aiQuery={aiQuery}
          aiResults={aiResults}
          webResults={webResults}
          onExitAiMode={exitAiMode}
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
          onOpenCalendar={() => setCalendarOpen(true)} 
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
            <input
              type="text"
              placeholder={activeTab === 'shelf' ? 'Search your shelf...' : 'Search, or ask AI anything...'}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); if (aiMode) exitAiMode(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && activeTab === 'recipes' && e.shiftKey) runAiSearch(); }}
            />
          </div>

          {activeTab === 'recipes' && (
            <button
              type="button"
              className={`ask-ai-btn${aiMode ? ' on' : ''}`}
              onClick={aiMode ? exitAiMode : runAiSearch}
              disabled={aiLoading}
              title={aiMode ? 'Back to fast search' : 'Ask AI (or Shift+Enter in the search box)'}
            >
              <span className="sparkle">{'\u2728'}</span>
              <span className="label">{aiMode ? 'Exit AI' : 'Ask AI'}</span>
            </button>
          )}

          <button className="filterbtn" onClick={() => setFilterPopupOpen(true)} aria-label="Filters">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M3 5h18" /><path d="M6 12h12" /><path d="M10 19h4" />
            </svg>
          </button>
        </div>
      )}

      {activeTab === 'pantry' && (
        <PantryView
          items={data.pantry}
          onAdd={data.addPantryItem}
          onEdit={data.editPantryItem}
          onToggleLowStock={data.togglePantryLowStock}
          onDelete={data.deletePantryItem}
          onSendLowStockToGrocery={data.sendLowStockToGrocery}
        />
      )}

      <button className="addbtn" onClick={handleAddButtonClick} aria-label="Add">+</button>

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

      <BookFormModal
        show={!!bookForm}
        editingBook={editingBook}
        onClose={() => setBookForm(null)}
        onSave={async (input) => { if (bookForm?.bookId) await data.editCookbook(bookForm.bookId, input); else await data.addCookbook(input); }}
      />

      <RecipeViewModal
        show={!!viewEntry}
        recipe={viewEntry?.recipe || null}
        book={viewEntry?.book || null}
        planEntries={data.mealPlan?.entries || []}
        onClose={() => setRecipeViewId(null)}
        onCook={() => recipeViewId && setCookSheet({ recipeId: recipeViewId, planEntryId: null })}
        onAddToPlan={() => recipeViewId && doAddToPlan(recipeViewId)}
        onAddToGrocery={() => recipeViewId && doAddToGrocery(recipeViewId)}
        onEdit={() => { if (viewEntry) { setRecipeEditor({ recipeId: viewEntry.recipe.id, bookId: viewEntry.book?.id ?? null }); setRecipeViewId(null); } }}
        onToggleFlag={(flag) => recipeViewId && data.toggleRecipeFlag(recipeViewId, flag)}
        onDeleteSession={(sessionId) => data.deleteSession(sessionId)}
        onDeleteRecipe={() => { if (recipeViewId && confirm('Delete this recipe?')) { data.removeRecipe(recipeViewId); setRecipeViewId(null); } }}
        entries={entries}
        onOpenRecipe={setRecipeViewId}
      />

      <RecipeEditorModal
        show={!!recipeEditor}
        editingRecipe={editingEntry?.recipe || null}
        initialBookId={recipeEditor?.bookId ?? null}
        initialImportUrl={recipeEditor?.importUrl ?? null}
        books={data.books}
        allTags={data.allTags()}
        onClose={() => setRecipeEditor(null)}
        onSave={async (cookbookId, input) => {
          if (editingEntry) await data.editRecipe(editingEntry.recipe.id, input);
          else await data.addRecipe(cookbookId, input);
        }}
        onDelete={editingEntry ? async (id) => { await data.removeRecipe(id); } : undefined}
      />

      <CookSheetModal
        show={!!cookSheet}
        recipe={cookEntry?.recipe || null}
        onClose={() => setCookSheet(null)}
        onSave={async (session) => { if (cookSheet) await data.cookRecipe(cookSheet.recipeId, session, cookSheet.planEntryId); }}
      />

      <CollectionAnalysisModal
        show={analysisOpen}
        books={data.books}
        standaloneRecipes={data.standaloneRecipes}
        onClose={() => setAnalysisOpen(false)}
      />

      <FilterPopup
        show={filterPopupOpen}
        onClose={() => setFilterPopupOpen(false)}
        {...(activeTab === 'shelf'
          ? { mode: 'shelf' as const, filters: shelfFilters, onChange: setShelfFilters, onClear: () => { setShelfFilters(BLANK_SHELF_FILTERS); setSearchTerm(''); }, resultCount: shelfResultCount, totalCount: data.books.length }
          : { mode: 'recipes' as const, filters: recipeFilters, onChange: setRecipeFilters, onClear: () => { setRecipeFilters(BLANK_RECIPE_FILTERS); setSearchTerm(''); }, books: data.books, allTags: data.allTags(), resultCount: recipeResultCount, totalCount: entries.length })}
      />

      <CalendarModal
        show={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        entries={entries}
        planEntries={data.mealPlan.entries}
        calendarEvents={data.calendarEvents}
        onOpenRecipe={setRecipeViewId}
        onScheduleRecipe={data.scheduleRecipeOnDate}
        onUnschedule={data.removePlanEntry}
        onAddEvent={data.addCalendarEvent}
        onDeleteEvent={data.deleteCalendarEvent}
      />

      <MenuPlannerModal
        show={menuPlannerOpen}
        entries={entries}
        onClose={() => setMenuPlannerOpen(false)}
        onOpenRecipe={setRecipeViewId}
        onAddMenuToPlan={addMenuToPlan}
      />

      <CsvImportModal show={csvOpen} books={data.books} onClose={() => setCsvOpen(false)} onImport={data.importCsvGroups} />
      <BackupModal show={backupOpen} onClose={() => setBackupOpen(false)} onExport={data.exportBackup} onImport={data.importBackupJson} />
    </>
  );
}