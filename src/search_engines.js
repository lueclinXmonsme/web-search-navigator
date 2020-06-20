/**
 * This file contains search engine specific logic via search engine objects.
 *
 * A search engine object must provide the following:
 *  - {regex} urlPattern
 *  - {CSS selector} searchBoxSelector
 *  - {SearchResult[]} getSearchResults()
 *  - {None} changeTools(period)
 *
 * Optional functions/properties:
 *  - {CSS class name} highlightClass:
 *    Default: "default-focused-search-result"
 *  - {Array} tabs
 *    Default: []
 *  - {int} marginTop: used if top results are not entirely visible
 *    Default: 0
 *  - {int} marginBottom: used if bottom results are not entirely visible
 *    Default: 0
 *  - {CSS selector} endlessScrollingContainer: CSS selector of the container
 *    containing search results that need tracking for endless scrolling
 *    support.
 *    Default: null
*/

/* eslint-disable max-len */

class SearchResult {
  /**
  * @param {Element} element
  * @param {function|null} anchorSelector
  * @param {string} highlightClass
  * @param {function|null} highlightedElementSelector
  * @param {function|null} containerSelector
  */
  constructor(element, anchorSelector, highlightClass,
      highlightedElementSelector, containerSelector) {
    this.element_ = element;
    this.anchorSelector_ = anchorSelector;
    this.highlightClass = highlightClass;
    this.highlightedElementSelector_ = highlightedElementSelector;
    this.containerSelector_ = containerSelector;
  }
  get anchor() {
    if (!this.anchorSelector_) {
      return this.element_;
    }
    return this.anchorSelector_(this.element_);
  }
  get container() {
    if (!this.containerSelector_) {
      return this.element_;
    }
    return this.containerSelector_(this.element_);
  }
  get highlightedElement() {
    if (!this.highlightedElementSelector_) {
      return this.element_;
    }
    return this.highlightedElementSelector_(this.element_);
  }
}

// eslint-disable-next-line
/**
 * @param {...[Element[], function|null]} includedSearchResults An array of
 * tuples.  Each tuple contains collection of the search results optionally
 * accompanied with their container selector.
 * @constructor
 */
const getSortedSearchResults = (
    includedSearchResults, excludedNodeList = []) => {
  const excludedResultsSet = new Set();
  for (const node of excludedNodeList) {
    excludedResultsSet.add(node);
  }
  const searchResults = [];
  for (const results of includedSearchResults) {
    for (const node of results.nodes) {
      if (!excludedResultsSet.has(node)) {
        // Prevent adding the same node multiple times.
        excludedResultsSet.add(node);
        searchResults.push(new SearchResult(
            node,
            results.anchorSelector,
            results.highlightClass,
            results.highlightedElementSelector,
            results.containerSelector,
        ));
      }
    }
  }
  // Sort searchResults by their document position.
  searchResults.sort((a, b) => {
    const position = a.anchor.compareDocumentPosition(b.anchor);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    } else {
      return 0;
    }
  });
  return searchResults;
};

class GoogleSearch {
  constructor(options) {
    this.options = options;
  }
  get urlPattern() {
    return /(www|encrypted)\.google\./;
  }
  get searchBoxSelector() {
    // Must match search engine search box
    // NOTE: we used '#searchform input[name=q]' before 2020-06-05 but that
    // doesn't work in the images search tab. Another option is to use
    // 'input[role="combobox"]' but this doesn't work when there's also a
    // dictionary search box.
    // return '#searchform input[name=q]',
    return 'form[role=search] input[name=q]';
  }
  get marginTop() {
    // When scrolling down, the search box can hide some of the search results,
    // so we try to compensate for it.
    const searchBoxContainer = document.querySelector('#searchform.minidiv');
    if (!searchBoxContainer) {
      return 0;
    }
    return searchBoxContainer.getBoundingClientRect().height;
  }

  isImagesTab() {
    return /[?&]tbm=isch(&|$)/.test(location.search);
  }

  getSearchResults() {
    // Don't initialize results navigation on image search, since it doesn't
    // work there.
    if (this.isImagesTab()) {
      return [];
    }
    const includedElements = [
      {
        nodes: document.querySelectorAll('#search .r > a:first-of-type'),
        highlightClass: 'default-focused-search-result',
        containerSelector: (n) => n.parentElement.parentElement,
      },
      {
        nodes: document.querySelectorAll('#search .r g-link > a:first-of-type'),
        highlightClass: 'default-focused-search-result',
        containerSelector: (n) => n.parentElement.parentElement,
      },
      {
        nodes: document.querySelectorAll('div.zjbNbe > a'),
        highlightClass: 'default-focused-search-result',
      },
      // Shopping results
      {
        nodes: document.querySelectorAll('div.eIuuYe a'),
        highlightClass: 'default-focused-search-result',
      },
      {
        nodes: document.querySelectorAll('#pnprev, #pnnext'),
        highlightClass: 'default-focused-search-result',
      },
    ];
    if (this.options.googleIncludeCards) {
      const nearestChildOrParentAnchor = (element) => {
        const childAnchor = element.querySelector('a');
        if (childAnchor && childAnchor.href) {
          return childAnchor;
        }
        return element.closest('a');
      };
      const nearestCardContainer = (element) => {
        return element.closest('g-inner-card');
      };
      includedElements.push(
          // Top stories, Twitter, and videos.
          {
            nodes: document.querySelectorAll(
                '[data-init-vis=true] [role=heading]'),
            anchorSelector: nearestChildOrParentAnchor,
            highlightedElementSelector: nearestCardContainer,
            highlightClass: 'google-focused-card',
          },
          // Small top stories section.
          {
            nodes: document.querySelectorAll('.P5BnJb'),
            anchorSelector: (n) => n.parentElement,
            highlightClass: 'default-focused-search-result',
          },
      );
    }
    return getSortedSearchResults(includedElements,
        document.querySelectorAll(
            '#search .kp-blk:not(.c2xzTb) .r > a:first-of-type'),
    );
  }

  // Array storing tuples of tabs navigation keybindings and their corresponding
  // CSS selector
  get tabs() {
    if (this.isImagesTab()) {
      // TODO: Make tabs work in the images tab. The code below doesn't quite
      // work because it seems that the order of tabs is dependent on the query.
      // return {
      //   navigateSearchTab: document.querySelector('.T47uwc > a:nth-child(1)'),
      //   navigateMapsTab: document.querySelector('.T47uwc > a:nth-child(3)'),
      //   navigateVideosTab: document.querySelector('.T47uwc > a:nth-child(4)'),
      //   navigateNewsTab: document.querySelector('.T47uwc > a:nth-child(5)'),
      //   navigatePreviousResultPage: document.querySelector('#pnprev'),
      //   navigateNextResultPage: document.querySelector('#pnnext'),
      // };
      return {};
    }
    return {
      navigateSearchTab: document.querySelector(
          'a.q.qs:not([href*="&tbm="]):not([href*="maps.google."])'),
      navigateImagesTab: document.querySelector('a.q.qs[href*="&tbm=isch"]'),
      navigateVideosTab: document.querySelector('a.q.qs[href*="&tbm=vid"]'),
      navigateMapsTab: document.querySelector('a.q.qs[href*="maps.google."]'),
      navigateNewsTab: document.querySelector('a.q.qs[href*="&tbm=nws"]'),
      navigateShoppingTab: document.querySelector('a.q.qs[href*="&tbm=shop"]'),
      navigateBooksTab: document.querySelector('a.q.qs[href*="&tbm=bks"]'),
      navigateFlightsTab: document.querySelector('a.q.qs[href*="&tbm=flm"]'),
      navigateFinancialTab: document.querySelector('a.q.qs[href*="&tbm=fin"]'),
      navigatePreviousResultPage: document.querySelector('#pnprev'),
      navigateNextResultPage: document.querySelector('#pnnext'),
    };
  }

  /**
   *  Filter the results based on special properties
   * @param {*} period, filter identifier. Accpeted filter are :
   *  'h' : get results from last hour
   *  'd' : get result from last day
   *  'w' : get results from last week
   *  'm' : get result from last month
   *  'y' : get result from last year
   *  'v' : verbatim search
   */
  changeTools(period) {
    // Save current period and sort.
    const res = /&(tbs=qdr:.)(,sbd:.)?/.exec(location.href);
    const currPeriod = (res && res[1]) || '';
    const currSort = (res && res[2]) || '';
    // Remove old period and sort.
    const strippedHref = location.href.replace(/&tbs=qdr:.(,sbd:.)?/, '');
    if (period) {
      location.href = strippedHref +
          (period === 'a' ? '' : '&tbs=qdr:' + period + currSort);
    } else if (currPeriod) {
      // Can't apply sort when not using period.
      location.href = strippedHref +
          '&' + currPeriod + (currSort ? '' : ',sbd:1');
    }
  }
}

class StartPage {
  constructor(options) {
    this.options = options;
  }
  get urlPattern() {
    return /(www\.)?startpage\./;
  }
  get searchBoxSelector() {
    return '.search-form__form input[id=q]';
  }
  get marginTop() {
    if (this.isSearchTab()) {
      return 113;
    }
    return 0;
  }

  isSearchTab() {
    return document.querySelector('div.layout-web') != null;
  }
  isImagesTab() {
    return document.querySelector('div.layout-images') != null;
  }

  getSearchResults() {
    // Don't initialize results navigation on image search, since it doesn't
    // work there.
    if (this.isImagesTab()) {
      return [];
    }
    const highlightedElementSelector = (element) => {
      if (this.isSearchTab()) {
        return element.closest('.w-gl__result');
      }
      return element;
    };
    const includedElements = [
      {
        nodes: document.querySelectorAll(
            '.w-gl--default.w-gl .w-gl__result a.w-gl__result-url'),
        highlightedElementSelector: highlightedElementSelector,
        highlightClass: 'startpage-focused-search-result',
        containerSelector: (n) => n.parentElement,
      },
      // As of 2020-06-20, this doesn't seem to match anything.
      {
        nodes: document.querySelectorAll(
            '.vo-sp.vo-sp--default > a.vo-sp__link'),
        highlightedElementSelector: highlightedElementSelector,
        highlightClass: 'startpage-focused-search-result',
      },
    ];
    return getSortedSearchResults(includedElements, []);
  }

  get tabs() {
    const menuLinks = document.querySelectorAll('.inline-nav-menu__link');
    if (!menuLinks || menuLinks.length < 4) {
      return {};
    }
    return {
      navigateSearchTab: menuLinks[0],
      navigateImagesTab: menuLinks[1],
      navigateVideosTab: menuLinks[2],
      navigateNewsTab: menuLinks[3],
      navigatePreviousResultPage: document.querySelector(
          'form.pagination__form.next-prev-form--desktop:first-of-type'),
      navigateNextResultPage: document.querySelector(
          'form.pagination__form.next-prev-form--desktop:last-of-type'),
    };
  }

  changeTools(period) {
    const forms = document.forms;
    let timeForm;

    for (let i = 0; i < forms.length; i++) {
      if (forms[i].className === 'search-filter-time__form') {
        timeForm = forms[i];
      }
    }

    switch (period) {
      case 'd':
        timeForm.elements['with_date'][1].click();
        break;
      case 'w':
        timeForm.elements['with_date'][2].click();
        break;
      case 'm':
        timeForm.elements['with_date'][3].click();
        break;
      case 'y':
        timeForm.elements['with_date'][4].click();
        break;
      default:
        break;
    }
  }
}

class Youtube {
  constructor(options) {
    this.options = options;
  }
  get urlPattern() {
    return /(www)\.youtube\./;
  }
  get searchBoxSelector() {
    return 'input#search';
  }
  get endlessScrollingContainer() {
    return document.querySelector('div#contents div#contents');
  }

  getSearchResults() {
    const includedElements = [
      // Videos
      {
        nodes: document.querySelectorAll('#title-wrapper h3 a#video-title'),
        highlightClass: 'youtube-focused-search-result',
        containerSelector: (n) => n.parentElement.parentElement,
      },
      // Playlists
      {
        nodes: document.querySelectorAll('div#content a.ytd-playlist-renderer'),
        highlightClass: 'youtube-focused-search-result',
      },
      {
        nodes: document.querySelectorAll(
            'div#content a.ytd-playlist-video-renderer'),
        highlightClass: 'youtube-focused-search-result',
      },
      // Mixes
      {
        nodes: document.querySelectorAll('div#content a.ytd-radio-renderer'),
        highlightClass: 'youtube-focused-search-result',
      },
      // Channels
      {
        nodes: document.querySelectorAll('div#info.ytd-channel-renderer'),
        highlightClass: 'youtube-focused-search-result',
      },
    ];
    return getSortedSearchResults(includedElements, []);
  }

  get tabs() {
    // TODO: Support tabs in Youtube.
    return {};
  }

  changeTools(period) {
    if (!document.querySelector('div#collapse-content')) {
      const toggleButton = document.querySelectorAll(
          'a.ytd-toggle-button-renderer')[0];
      // Toggling the buttons ensures that div#collapse-content is loaded
      toggleButton.click();
      toggleButton.click();
    }
    const forms = document.querySelectorAll(
        'div#collapse-content > *:first-of-type ytd-search-filter-renderer');
    let neededForm = null;
    switch (period) {
      case 'h':
        neededForm = forms[0];
        break;
      case 'd':
        neededForm = forms[1];
        break;
      case 'w':
        neededForm = forms[2];
        break;
      case 'm':
        neededForm = forms[3];
        break;
      case 'y':
        neededForm = forms[4];
        break;
    }
    if (neededForm) {
      neededForm.childNodes[1].click();
    }
  }
}

class GoogleScholar {
  constructor(options) {
    this.options = options;
  }
  get urlPattern() {
    return /scholar\.google\.com\/scholar/;
  }
  get searchBoxSelector() {
    return '#gs_hdr_tsi';
  }

  getSearchResults() {
    const includedElements = [
      {
        nodes: document.querySelectorAll('.gs_rt a'),
        highlightClass: 'default-focused-search-result',
        containerSelector: (n) => n.parentElement.parentElement,
      },
      {
        nodes: document.querySelectorAll(
            '.gs_ico_nav_previous, .gs_ico_nav_next'),
        anchorSelector: (n) => n.parentElement,
        highlightClass: 'google-scholar-next-page',
        highlightedElementSelector: (n) => n.parentElement.children[1],
        containerSelector: (n) => n.parentElement.children[1],
      },
    ];
    return getSortedSearchResults(includedElements, []);
  }

  get tabs() {
    return {
      navigatePreviousResultPage:
          document.querySelector('.gs_ico_nav_previous').parentElement,
      navigateNextResultPage:
          document.querySelector('.gs_ico_nav_next').parentElement,
    };
  }
}

class Amazon {
  constructor(options) {
    this.options = options;
  }
  get urlPattern() {
    return /(www\.)?amazon\.com\/s\?/;
  }
  get searchBoxSelector() {
    return '#twotabsearchtextbox';
  }

  getSearchResults() {
    const includedElements = [
      {
        nodes: document.querySelectorAll(
            '.s-search-results h2 .a-link-normal.a-text-normal'),
        highlightClass: 'amazon-focused-search-result',
        // containerSelector: (n) => n.closest('.sg-row').parentElement.closest('.sg-row')
      },
      {
        nodes: document.querySelectorAll('.a-pagination a'),
        highlightClass: 'amazon-focused-search-result',
      },
    ];
    return getSortedSearchResults(includedElements, []);
  }

  get tabs() {
    const pagesTabs = {
      navigateNextResultPage:
          document.querySelector('.a-pagination .a-last a'),
    };
    const paginationContainer = document.querySelector('.a-pagination');
    if (paginationContainer && paginationContainer.children[0] && !paginationContainer.children[0].classList.contains('a-normal')) {
      pagesTabs.navigatePreviousResultPage =
        paginationContainer.children[0].querySelector('a');
    }
    return pagesTabs;
  }
}

// Get search engine object matching the current url
/* eslint-disable-next-line no-unused-vars */
const getSearchEngine = (options) => {
  const searchEngines = [
    new GoogleSearch(options),
    new StartPage(options),
    new Youtube(options),
    new GoogleScholar(options),
    new Amazon(options),
  ];
  // Switch over all compatible search engines
  const href = window.location.href;
  for (let i = 0; i < searchEngines.length; i++) {
    if (href.match(searchEngines[i].urlPattern)) {
      return searchEngines[i];
    }
  }
  return null;
};
