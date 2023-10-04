import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import qs from 'qs';
import payload from '../../src';
import { AdminUrlUtil } from '../helpers/adminUrlUtil';
import { initPayloadE2E } from '../helpers/configHelpers';
import { saveDocAndAssert, saveDocHotkeyAndAssert } from '../helpers';
import type { Post } from './config';
import { globalSlug, slug } from './shared';
import { mapAsync } from '../../src/utilities/mapAsync';
import wait from '../../src/utilities/wait';

const { afterEach, beforeAll, beforeEach, describe } = test;

const title = 'title';
const description = 'description';

let url: AdminUrlUtil;
let serverURL: string;

describe('admin', () => {
  let page: Page;

  beforeAll(async ({ browser }) => {
    serverURL = (await initPayloadE2E(__dirname)).serverURL;
    await clearDocs(); // Clear any seeded data from onInit
    url = new AdminUrlUtil(serverURL, slug);

    const context = await browser.newContext();
    page = await context.newPage();
  });

  afterEach(async () => {
    await clearDocs();
    // clear preferences
    await payload.preferences.Model.deleteMany();
  });

  describe('Nav', () => {
    test('should nav to collection - sidebar', async () => {
      await page.goto(url.admin);
      const collectionLink = page.locator(`#nav-${slug}`);
      await collectionLink.click();

      expect(page.url()).toContain(url.list);
    });

    test('should nav to a global - sidebar', async () => {
      await page.goto(url.admin);
      await page.locator(`#nav-global-${globalSlug}`).click();

      expect(page.url()).toContain(url.global(globalSlug));
    });

    test('should navigate to collection - card', async () => {
      await page.goto(url.admin);
      await page.locator(`#card-${slug}`).click();
      expect(page.url()).toContain(url.list);
    });

    test('should collapse and expand collection groups', async () => {
      await page.goto(url.admin);
      const navGroup = page.locator('#nav-group-One .nav-group__toggle');
      const link = page.locator('#nav-group-one-collection-ones');

      await expect(navGroup).toContainText('One');
      await expect(link).toBeVisible();

      await navGroup.click();
      await expect(link).toBeHidden();

      await navGroup.click();
      await expect(link).toBeVisible();
    });

    test('should collapse and expand globals groups', async () => {
      await page.goto(url.admin);
      const navGroup = page.locator('#nav-group-Group .nav-group__toggle');
      const link = page.locator('#nav-global-group-globals-one');

      await expect(navGroup).toContainText('Group');
      await expect(link).toBeVisible();

      await navGroup.click();
      await expect(link).toBeHidden();

      await navGroup.click();
      await expect(link).toBeVisible();
    });

    test('should save nav group collapse preferences', async () => {
      await page.goto(url.admin);

      const navGroup = page.locator('#nav-group-One .nav-group__toggle');
      await navGroup.click();

      await page.goto(url.admin);

      const link = page.locator('#nav-group-one-collection-ones');
      await expect(link).toBeHidden();
    });

    test('breadcrumbs - from list to dashboard', async () => {
      await page.goto(url.list);
      await page.locator('.step-nav a[href="/admin"]').click();
      expect(page.url()).toContain(url.admin);
    });

    test('breadcrumbs - from document to collection', async () => {
      const { id } = await createPost();

      await page.goto(url.edit(id));
      await page.locator(`.step-nav >> text=${slug}`).click();
      expect(page.url()).toContain(url.list);
    });

    test('should not show hidden collections and globals', async () => {
      await page.goto(url.admin);

      // nav menu
      await expect(page.locator('#nav-hidden-collection')).toBeHidden();
      await expect(page.locator('#nav-hidden-global')).toBeHidden();

      // dashboard
      await expect(page.locator('#card-hidden-collection')).toBeHidden();
      await expect(page.locator('#card-hidden-global')).toBeHidden();

      // routing
      await page.goto(url.collection('hidden-collection'));
      await expect(page.locator('.not-found')).toContainText('Nothing found');
      await page.goto(url.global('hidden-global'));
      await expect(page.locator('.not-found')).toContainText('Nothing found');
    });
  });

  describe('CRUD', () => {
    test('should create', async () => {
      await page.goto(url.create);
      await page.locator('#field-title').fill(title);
      await page.locator('#field-description').fill(description);

      await saveDocAndAssert(page);

      await expect(page.locator('#field-title')).toHaveValue(title);
      await expect(page.locator('#field-description')).toHaveValue(description);
    });

    test('should read existing', async () => {
      const { id } = await createPost();

      await page.goto(url.edit(id));

      await expect(page.locator('#field-title')).toHaveValue(title);
      await expect(page.locator('#field-description')).toHaveValue(description);
    });

    test('should update existing', async () => {
      const { id } = await createPost();

      await page.goto(url.edit(id));

      const newTitle = 'new title';
      const newDesc = 'new description';
      await page.locator('#field-title').fill(newTitle);
      await page.locator('#field-description').fill(newDesc);

      await saveDocAndAssert(page);

      await expect(page.locator('#field-title')).toHaveValue(newTitle);
      await expect(page.locator('#field-description')).toHaveValue(newDesc);
    });

    test('should save using hotkey', async () => {
      const { id } = await createPost();
      await page.goto(url.edit(id));

      const newTitle = 'new title';
      await page.locator('#field-title').fill(newTitle);

      await saveDocHotkeyAndAssert(page);

      await expect(page.locator('#field-title')).toHaveValue(newTitle);
    });

    test('should delete existing', async () => {
      const { id, ...post } = await createPost();

      await page.goto(url.edit(id));
      await page.locator('#action-delete').click();
      await page.locator('#confirm-delete').click();

      await expect(page.locator(`text=Post en "${post.title}" successfully deleted.`)).toBeVisible();
      expect(page.url()).toContain(url.list);
    });

    test('should bulk delete', async () => {
      createPost();
      createPost();
      createPost();

      await page.goto(url.list);

      await page.locator('input#select-all').check();

      await page.locator('.delete-documents__toggle').click();

      await page.locator('#confirm-delete').click();

      await expect(page.locator('.Toastify__toast--success')).toHaveText('Deleted 3 Posts en successfully.');
      await expect(page.locator('.collection-list__no-results')).toBeVisible();
    });

    test('should bulk update', async () => {
      createPost();
      createPost();
      createPost();

      const bulkTitle = 'Bulk update title';
      await page.goto(url.list);

      await page.locator('input#select-all').check();
      await page.locator('.edit-many__toggle').click();
      await page.locator('.field-select .rs__control').click();
      const options = page.locator('.rs__option');
      const titleOption = options.locator('text=Title en');

      await expect(titleOption).toHaveText('Title en');

      await titleOption.click();
      const titleInput = page.locator('#field-title');

      await expect(titleInput).toBeVisible();

      await titleInput.fill(bulkTitle);

      await page.locator('.form-submit button[type="submit"]').click();
      await expect(page.locator('.Toastify__toast--success')).toContainText('Updated 3 Posts en successfully.');
      await expect(page.locator('.row-1 .cell-title')).toContainText(bulkTitle);
      await expect(page.locator('.row-2 .cell-title')).toContainText(bulkTitle);
      await expect(page.locator('.row-3 .cell-title')).toContainText(bulkTitle);
    });

    test('should save globals', async () => {
      await page.goto(url.global(globalSlug));

      await page.locator('#field-title').fill(title);
      await saveDocAndAssert(page);

      await expect(page.locator('#field-title')).toHaveValue(title);
    });
  });

  describe('i18n', () => {
    test('should allow changing language', async () => {
      await page.goto(url.account);

      const field = page.locator('.account__language .react-select');

      await field.click();
      const options = page.locator('.rs__option');
      await options.locator('text=Español').click();

      await expect(page.locator('.step-nav')).toContainText('Tablero');

      await field.click();
      await options.locator('text=English').click();
      await field.click();
      await expect(page.locator('.form-submit .btn')).toContainText('Save');
    });

    test('should allow custom translation', async () => {
      await page.goto(url.account);
      await expect(page.locator('.step-nav')).toContainText('Home');
    });
  });

  describe('list view', () => {
    const tableRowLocator = 'table >> tbody >> tr';

    beforeEach(async () => {
      await page.goto(url.list);
    });

    describe('filtering', () => {
      test('search by id', async () => {
        const { id } = await createPost();
        await page.locator('.search-filter__input').fill(id);
        const tableItems = page.locator(tableRowLocator);
        await expect(tableItems).toHaveCount(1);
      });

      test('search by title or description', async () => {
        await createPost({
          title: 'find me',
          description: 'this is fun',
        });

        await page.locator('.search-filter__input').fill('find me');
        await expect(page.locator(tableRowLocator)).toHaveCount(1);

        await page.locator('.search-filter__input').fill('this is fun');
        await expect(page.locator(tableRowLocator)).toHaveCount(1);
      });

      test('toggle columns', async () => {
        const columnCountLocator = 'table >> thead >> tr >> th';
        await createPost();

        await page.locator('.list-controls__toggle-columns').click();

        // wait until the column toggle UI is visible and fully expanded
        await expect(page.locator('.list-controls__columns.rah-static--height-auto')).toBeVisible();


        const numberOfColumns = await page.locator(columnCountLocator).count();
        await expect(page.locator('table >> thead >> tr >> th:nth-child(2)')).toHaveText('ID');

        const idButton = page.locator('.column-selector >> text=ID');

        // Remove ID column
        await idButton.click();
        // wait until .cell-id is not present on the page:
        await page.locator('.cell-id').waitFor({ state: 'detached' });

        await expect(page.locator(columnCountLocator)).toHaveCount(numberOfColumns - 1);
        await expect(page.locator('table >> thead >> tr >> th:nth-child(2)')).toHaveText('Number');

        // Add back ID column
        await idButton.click();
        await expect(page.locator('.cell-id')).toBeVisible();

        await expect(page.locator(columnCountLocator)).toHaveCount(numberOfColumns);
        await expect(page.locator('table >> thead >> tr >> th:nth-child(2)')).toHaveText('ID');
      });

      test('2nd cell is a link', async () => {
        const { id } = await createPost();
        const linkCell = page.locator(`${tableRowLocator} td`).nth(1).locator('a');
        await expect(linkCell).toHaveAttribute('href', `/admin/collections/posts/${id}`);

        // open the column controls
        await page.locator('.list-controls__toggle-columns').click();
        // wait until the column toggle UI is visible and fully expanded
        await expect(page.locator('.list-controls__columns.rah-static--height-auto')).toBeVisible();

        // toggle off the ID column
        page.locator('.column-selector >> text=ID').click();
        // wait until .cell-id is not present on the page:
        await page.locator('.cell-id').waitFor({ state: 'detached' });

        // recheck that the 2nd cell is still a link
        await expect(linkCell).toHaveAttribute('href', `/admin/collections/posts/${id}`);
      });

      test('filter rows', async () => {
        const { id } = await createPost({ title: 'post1' });
        await createPost({ title: 'post2' });

        // open the column controls
        await page.locator('.list-controls__toggle-columns').click();
        // wait until the column toggle UI is visible and fully expanded
        await expect(page.locator('.list-controls__columns.rah-static--height-auto')).toBeVisible();


        // ensure the ID column is active
        const idButton = page.locator('.column-selector >> text=ID');
        const buttonClasses = await idButton.getAttribute('class');
        if (buttonClasses && !buttonClasses.includes('column-selector__column--active')) {
          await idButton.click();
          await expect(page.locator(tableRowLocator).first().locator('.cell-id')).toBeVisible();
        }

        await expect(page.locator(tableRowLocator)).toHaveCount(2);

        await page.locator('.list-controls__toggle-where').click();
        // wait until the filter UI is visible and fully expanded
        await expect(page.locator('.list-controls__where.rah-static--height-auto')).toBeVisible();

        await page.locator('.where-builder__add-first-filter').click();

        const operatorField = page.locator('.condition__operator');
        const valueField = page.locator('.condition__value >> input');

        await operatorField.click();

        const dropdownOptions = operatorField.locator('.rs__option');
        await dropdownOptions.locator('text=equals').click();

        await valueField.fill(id);

        await expect(page.locator(tableRowLocator)).toHaveCount(1);
        const firstId = await page.locator(tableRowLocator).first().locator('.cell-id').innerText();
        expect(firstId).toEqual(id);

        // Remove filter
        await page.locator('.condition__actions-remove').click();
        await expect(page.locator(tableRowLocator)).toHaveCount(2);
      });

      test('should accept where query from valid URL where parameter', async () => {
        await createPost({ title: 'post1' });
        await createPost({ title: 'post2' });
        await page.goto(`${url.list}?limit=10&page=1&where[or][0][and][0][title][equals]=post1`);

        await expect(page.locator('.react-select--single-value').first()).toContainText('Title en');
        await expect(page.locator(tableRowLocator)).toHaveCount(1);
      });

      test('should accept transformed where query from invalid URL where parameter', async () => {
        await createPost({ title: 'post1' });
        await createPost({ title: 'post2' });
        // [title][equals]=post1 should be getting transformed into a valid where[or][0][and][0][title][equals]=post1
        await page.goto(`${url.list}?limit=10&page=1&where[title][equals]=post1`);

        await expect(page.locator('.react-select--single-value').first()).toContainText('Title en');
        await expect(page.locator(tableRowLocator)).toHaveCount(1);
      });

      test('should accept where query from complex, valid URL where parameter using the near operator', async () => {
        // We have one point collection with the point [5,-5] and one with [7,-7]. This where query should kick out the [5,-5] point
        await page.goto(`${new AdminUrlUtil(serverURL, 'geo').list}?limit=10&page=1&where[or][0][and][0][point][near]=6,-7,200000`);

        await expect(page.getByPlaceholder('Enter a value')).toHaveValue('6,-7,200000');
        await expect(page.locator(tableRowLocator)).toHaveCount(1);
      });

      test('should accept transformed where query from complex, invalid URL where parameter using the near operator', async () => {
        // We have one point collection with the point [5,-5] and one with [7,-7]. This where query should kick out the [5,-5] point
        await page.goto(`${new AdminUrlUtil(serverURL, 'geo').list}?limit=10&page=1&where[point][near]=6,-7,200000`);

        await expect(page.getByPlaceholder('Enter a value')).toHaveValue('6,-7,200000');
        await expect(page.locator(tableRowLocator)).toHaveCount(1);
      });

      test('should accept where query from complex, valid URL where parameter using the within operator', async () => {
        type Point = [number, number];
        const polygon: Point[] = [
          [3.5, -3.5], // bottom-left
          [3.5, -6.5], // top-left
          [6.5, -6.5], // top-right
          [6.5, -3.5], // bottom-right
          [3.5, -3.5], // back to starting point to close the polygon
        ];

        const whereQueryJSON = {
          point: {
            within: {
              type: 'Polygon',
              coordinates: [polygon],
            },
          },
        };

        const whereQuery = qs.stringify({
          ...({ where: whereQueryJSON }),
        }, {
          addQueryPrefix: false,
        });

        // We have one point collection with the point [5,-5] and one with [7,-7]. This where query should kick out the [7,-7] point, as it's not within the polygon
        await page.goto(`${new AdminUrlUtil(serverURL, 'geo').list}?limit=10&page=1&${whereQuery}`);

        await expect(page.getByPlaceholder('Enter a value')).toHaveValue('[object Object]');
        await expect(page.locator(tableRowLocator)).toHaveCount(1);
      });
    });

    describe('table columns', () => {
      const reorderColumns = async () => {
        // open the column controls
        await page.locator('.list-controls__toggle-columns').click();
        // wait until the column toggle UI is visible and fully expanded
        await expect(page.locator('.list-controls__columns.rah-static--height-auto')).toBeVisible();

        const numberBoundingBox = await page.locator('.column-selector >> text=Number').boundingBox();
        const idBoundingBox = await page.locator('.column-selector >> text=ID').boundingBox();

        if (!numberBoundingBox || !idBoundingBox) return;

        // drag the "number" column to the left of the "ID" column
        await page.mouse.move(numberBoundingBox.x + 2, numberBoundingBox.y + 2, { steps: 10 });
        await page.mouse.down();
        await wait(300);

        await page.mouse.move(idBoundingBox.x - 2, idBoundingBox.y - 2, { steps: 10 });
        await page.mouse.up();

        // ensure the "number" column is now first
        await expect(page.locator('.list-controls .column-selector .column-selector__column').first()).toHaveText('Number');
        await expect(page.locator('table thead tr th').nth(1)).toHaveText('Number');

        // TODO: This wait makes sure the preferences are actually saved. Just waiting for the UI to update is not enough. We should replace this wait
        await wait(1000);
      };

      test('should drag to reorder columns and save to preferences', async () => {
        await createPost();

        await reorderColumns();

        // reload to ensure the preferred order was stored in the database
        await page.reload();
        await expect(page.locator('.list-controls .column-selector .column-selector__column').first()).toHaveText('Number');
        await expect(page.locator('table thead tr th').nth(1)).toHaveText('Number');
      });

      test('should render drawer columns in order', async () => {
        // Re-order columns like done in the previous test
        await createPost();
        await reorderColumns();

        await page.reload();


        await createPost();
        await page.goto(url.create);

        // Open the drawer
        await page.locator('.rich-text .list-drawer__toggler').click();
        const listDrawer = page.locator('[id^=list-drawer_1_]');
        await expect(listDrawer).toBeVisible();

        const collectionSelector = page.locator('[id^=list-drawer_1_] .list-drawer__select-collection.react-select');

        // select the "Post en" collection
        await collectionSelector.click();
        await page.locator('[id^=list-drawer_1_] .list-drawer__select-collection.react-select .rs__option >> text="Post en"').click();

        // open the column controls
        const columnSelector = page.locator('[id^=list-drawer_1_] .list-controls__toggle-columns');
        await columnSelector.click();
        // wait until the column toggle UI is visible and fully expanded
        await expect(page.locator('.list-controls__columns.rah-static--height-auto')).toBeVisible();

        // ensure that the columns are in the correct order
        await expect(page.locator('[id^=list-drawer_1_] .list-controls .column-selector .column-selector__column').first()).toHaveText('Number');
      });

      test('should retain preferences when changing drawer collections', async () => {
        await page.goto(url.create);

        // Open the drawer
        await page.locator('.rich-text .list-drawer__toggler').click();
        const listDrawer = page.locator('[id^=list-drawer_1_]');
        await expect(listDrawer).toBeVisible();

        const collectionSelector = page.locator('[id^=list-drawer_1_] .list-drawer__select-collection.react-select');
        const columnSelector = page.locator('[id^=list-drawer_1_] .list-controls__toggle-columns');

        // open the column controls
        await columnSelector.click();
        // wait until the column toggle UI is visible and fully expanded
        await expect(page.locator('.list-controls__columns.rah-static--height-auto')).toBeVisible();

        // deselect the "id" column
        await page.locator('[id^=list-drawer_1_] .list-controls .column-selector .column-selector__column >> text=ID').click();

        // select the "Post en" collection
        await collectionSelector.click();
        await page.locator('[id^=list-drawer_1_] .list-drawer__select-collection.react-select .rs__option >> text="Post en"').click();

        // deselect the "number" column
        await page.locator('[id^=list-drawer_1_] .list-controls .column-selector .column-selector__column >> text=Number').click();

        // select the "User" collection again
        await collectionSelector.click();
        await page.locator('[id^=list-drawer_1_] .list-drawer__select-collection.react-select .rs__option >> text="User"').click();

        // ensure that the "id" column is still deselected
        await expect(page.locator('[id^=list-drawer_1_] .list-controls .column-selector .column-selector__column').first()).not.toHaveClass('column-selector__column--active');

        // select the "Post en" collection again
        await collectionSelector.click();
        await page.locator('[id^=list-drawer_1_] .list-drawer__select-collection.react-select .rs__option >> text="Post en"').click();

        // ensure that the "number" column is still deselected
        await expect(page.locator('[id^=list-drawer_1_] .list-controls .column-selector .column-selector__column').first()).not.toHaveClass('column-selector__column--active');
      });

      test('should render custom table cell component', async () => {
        await createPost();
        await page.goto(url.list);
        await expect(page.locator('table >> thead >> tr >> th >> text=Demo UI Field')).toBeVisible();
      });
    });

    describe('multi-select', () => {
      beforeEach(async () => {
        await mapAsync([...Array(3)], async () => {
          await createPost();
        });
      });

      test('should select multiple rows', async () => {
        const selectAll = page.locator('.custom-checkbox:has(#select-all)');
        await page.locator('.row-1 .cell-_select input').check();

        const indeterminateSelectAll = selectAll.locator('.custom-checkbox__icon.partial');
        expect(indeterminateSelectAll).toBeDefined();

        await selectAll.locator('input').click();
        const emptySelectAll = selectAll.locator('.custom-checkbox__icon:not(.check):not(.partial)');
        await expect(emptySelectAll).toHaveCount(0);

        await selectAll.locator('input').click();
        const checkSelectAll = selectAll.locator('.custom-checkbox__icon.check');
        expect(checkSelectAll).toBeDefined();
      });

      test('should delete many', async () => {
        // delete should not appear without selection
        await expect(page.locator('#confirm-delete')).toHaveCount(0);
        // select one row
        await page.locator('.row-1 .cell-_select input').check();

        // delete button should be present
        await expect(page.locator('#confirm-delete')).toHaveCount(1);

        await page.locator('.row-2 .cell-_select input').check();

        await page.locator('.delete-documents__toggle').click();
        await page.locator('#confirm-delete').click();
        await expect(await page.locator('.cell-_select')).toHaveCount(1);
      });
    });

    describe('pagination', () => {
      beforeAll(async () => {
        await mapAsync([...Array(11)], async () => {
          await createPost();
        });
      });

      test('should paginate', async () => {
        const pageInfo = page.locator('.collection-list__page-info');
        const perPage = page.locator('.per-page');
        const paginator = page.locator('.paginator');
        const tableItems = page.locator(tableRowLocator);

        await expect(tableItems).toHaveCount(10);
        await expect(pageInfo).toHaveText('1-10 of 11');
        await expect(perPage).toContainText('Per Page: 10');

        // Forward one page and back using numbers
        await paginator.locator('button').nth(1).click();
        expect(page.url()).toContain('page=2');
        await expect(tableItems).toHaveCount(1);
        await paginator.locator('button').nth(0).click();
        expect(page.url()).toContain('page=1');
        await expect(tableItems).toHaveCount(10);
      });
    });

    describe('custom css', () => {
      test('should see custom css in admin UI', async () => {
        await page.goto(url.admin);
        const navControls = page.locator('.nav__controls');
        await expect(navControls).toHaveCSS('font-family', 'monospace');
      });
    });

    // TODO: Troubleshoot flaky suite
    describe.skip('sorting', () => {
      beforeAll(async () => {
        await createPost();
        await createPost();
      });

      test('should sort', async () => {
        const upChevron = page.locator('#heading-id .sort-column__asc');
        const downChevron = page.locator('#heading-id .sort-column__desc');

        const firstId = await page.locator('.row-1 .cell-id').innerText();
        const secondId = await page.locator('.row-2 .cell-id').innerText();

        await upChevron.click({ delay: 200 });

        // Order should have swapped
        expect(await page.locator('.row-1 .cell-id').innerText()).toEqual(secondId);
        expect(await page.locator('.row-2 .cell-id').innerText()).toEqual(firstId);

        await downChevron.click({ delay: 200 });

        // Swap back
        expect(await page.locator('.row-1 .cell-id').innerText()).toEqual(firstId);
        expect(await page.locator('.row-2 .cell-id').innerText()).toEqual(secondId);
      });
    });

    describe('i18n', () => {
      test('should display translated collections and globals config options', async () => {
        await page.goto(url.list);

        // collection label
        await expect(page.locator('#nav-posts')).toContainText('Posts en');

        // global label
        await expect(page.locator('#nav-global-global')).toContainText('Global en');

        // view description
        await expect(page.locator('.view-description')).toContainText('Description en');
      });

      test('should display translated field titles', async () => {
        await createPost();

        // column controls
        await page.locator('.list-controls__toggle-columns').click();
        await expect(page.locator('.column-selector__column >> text=Title en')).toHaveText('Title en');

        // filters
        await page.locator('.list-controls__toggle-where').click();
        await page.locator('.where-builder__add-first-filter').click();
        await page.locator('.condition__field .rs__control').click();
        const options = page.locator('.rs__option');
        await expect(options.locator('text=Title en')).toHaveText('Title en');

        // list columns
        await expect(page.locator('#heading-title .sort-column__label')).toHaveText('Title en');
        await expect(page.locator('.search-filter input')).toHaveAttribute('placeholder', /(Title en)/);
      });

      test('should use fallback language on field titles', async () => {
        // change language German
        await page.goto(url.account);
        await page.locator('.account__language .react-select').click();
        const languageSelect = page.locator('.rs__option');
        // text field does not have a 'de' label
        await languageSelect.locator('text=Deutsch').click();

        await page.goto(url.list);
        await page.locator('.list-controls__toggle-columns').click();
        // expecting the label to fall back to english as default fallbackLng
        await expect(page.locator('.column-selector__column >> text=Title en')).toHaveText('Title en');
      });
    });
  });
});

async function createPost(overrides?: Partial<Post>): Promise<Post> {
  return payload.create({
    collection: slug,
    data: {
      title,
      description,
      ...overrides,
    },
  });
}

async function clearDocs(): Promise<void> {
  const allDocs = await payload.find({ collection: slug, limit: 100 });
  const ids = allDocs.docs.map((doc) => doc.id);
  await mapAsync(ids, async (id) => {
    await payload.delete({ collection: slug, id });
  });
}
