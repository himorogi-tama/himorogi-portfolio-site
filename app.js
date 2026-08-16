(async function () {
  "use strict";

  const root = document.documentElement;
  const body = document.body;
  configureSitePolicy();

  const siteRootUrl = new URL("./", document.baseURI);
  let data;
  try {
    data = adaptPortfolio(await loadPortfolio());
  } catch (error) {
    showSiteError(error);
    return;
  }

  const seasonKey = "portfolio-site-season";
  const viewKey = "portfolio-site-view";
  const pageSizeKey = "portfolio-site-page-size";
  const storedPageSize = Number.parseInt(safeStorageGet(pageSizeKey), 10);
  const indexState = {
    activeSeries: "すべて",
    currentPage: 1,
    pageSize: data.pageSizeOptions.includes(storedPageSize)
      ? storedPageSize
      : data.defaultPageSize
  };
  let enThreadController = null;

  const storedSeason = safeStorageGet(seasonKey);
  const storedView = safeStorageGet(viewKey);
  const season = data.seasons.some(item => item.id === storedSeason)
    ? storedSeason
    : data.defaultSeason;
  const view = data.views.some(item => item.id === storedView)
    ? storedView
    : data.defaultView;

  hydrateCommonContent();
  applySeason(season);
  applyView(view);
  configureHeader();
  configureBackToTop();
  updateCurrentYear();

  try {
    if (body.dataset.page === "index") {
      buildIndex();
      configureOpeningVisual();
      enThreadController = configureEnThread();
    } else {
      buildWorkDetail();
    }
  } catch (error) {
    showSiteError(error);
    return;
  }
  markSiteReady();

  function applySeason(value) {
    root.dataset.season = value;
    safeStorageSet(seasonKey, value);
    document.querySelectorAll("[data-season-button]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.seasonButton === value));
    });
    const seasonInfo = data.seasons.find(item => item.id === value);
    const issue = document.querySelector(".issue-mark");
    if (issue && seasonInfo) {
      issue.textContent = `季節の展示 / ${seasonInfo.label}`;
    }
    scheduleEnThreadLayout();
  }

  function applyView(value) {
    root.dataset.view = value;
    safeStorageSet(viewKey, value);
    document.querySelectorAll("[data-view-button]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.viewButton === value));
    });
    scheduleEnThreadLayout();
  }

  function buildIndex() {
    buildControls(
      document.querySelector("[data-season-controls]"),
      data.seasons,
      "season"
    );
    buildControls(
      document.querySelector("[data-view-controls]"),
      data.views,
      "view"
    );
    configurePaginationControls();

    const allSeries = Array.from(new Set(data.works.flatMap(work => work.series)));
    const filterHost = document.querySelector("[data-series-filters]");

    ["すべて", ...allSeries].forEach(series => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "series-chip";
      button.textContent = series;
      button.setAttribute("aria-pressed", String(series === indexState.activeSeries));
      button.addEventListener("click", () => {
        indexState.activeSeries = series;
        indexState.currentPage = 1;
        filterHost.querySelectorAll("button").forEach(item => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        renderWorks();
      });
      filterHost.append(button);
    });

    renderWorks();
  }

  function buildControls(host, items, type) {
    if (!host) {
      return;
    }
    items.forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.label;
      if (type === "season") {
        button.dataset.seasonButton = item.id;
        button.setAttribute("aria-pressed", String(root.dataset.season === item.id));
        button.addEventListener("click", () => applySeason(item.id));
      } else {
        button.dataset.viewButton = item.id;
        button.setAttribute("aria-pressed", String(root.dataset.view === item.id));
        button.addEventListener("click", () => applyView(item.id));
      }
      host.append(button);
    });
  }

  function configurePaginationControls() {
    const sizeHost = document.querySelector("[data-page-size-controls]");
    const previousButton = document.querySelector("[data-page-previous]");
    const nextButton = document.querySelector("[data-page-next]");
    if (!sizeHost || !previousButton || !nextButton) {
      return;
    }

    data.pageSizeOptions.forEach(pageSize => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(pageSize);
      button.dataset.pageSize = String(pageSize);
      button.setAttribute("aria-pressed", String(pageSize === indexState.pageSize));
      button.addEventListener("click", () => {
        indexState.pageSize = pageSize;
        indexState.currentPage = 1;
        safeStorageSet(pageSizeKey, String(pageSize));
        sizeHost.querySelectorAll("button").forEach(item => {
          item.setAttribute("aria-pressed", String(item === button));
        });
        renderWorks();
      });
      sizeHost.append(button);
    });

    previousButton.addEventListener("click", () => movePage(-1));
    nextButton.addEventListener("click", () => movePage(1));
  }

  function movePage(direction) {
    indexState.currentPage += direction;
    renderWorks();
    const collection = document.querySelector(".collection");
    if (collection) {
      collection.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start"
      });
    }
  }

  function renderWorks() {
    const host = document.querySelector("[data-works]");
    const empty = document.querySelector("[data-empty]");
    const count = document.querySelector("[data-result-count]");
    const visible = indexState.activeSeries === "すべて"
      ? data.works
      : data.works.filter(work => work.series.includes(indexState.activeSeries));
    const totalPages = Math.max(1, Math.ceil(visible.length / indexState.pageSize));
    indexState.currentPage = Math.min(
      totalPages,
      Math.max(1, indexState.currentPage)
    );
    const pageStart = (indexState.currentPage - 1) * indexState.pageSize;
    const pageWorks = visible.slice(pageStart, pageStart + indexState.pageSize);

    host.replaceChildren();
    pageWorks.forEach((work, index) => host.append(createWorkCard(work, pageStart + index)));
    empty.hidden = visible.length !== 0;
    count.textContent = `${visible.length}作品`;
    updatePaginationControls(totalPages, visible.length);
    scheduleEnThreadLayout();
  }

  function updatePaginationControls(totalPages, totalWorks) {
    const pagination = document.querySelector("[data-pagination]");
    const status = document.querySelector("[data-page-status]");
    const previousButton = document.querySelector("[data-page-previous]");
    const nextButton = document.querySelector("[data-page-next]");
    if (!pagination || !status || !previousButton || !nextButton) {
      return;
    }

    status.textContent = totalWorks === 0
      ? "0 / 0"
      : `${indexState.currentPage} / ${totalPages}`;
    previousButton.disabled = totalWorks === 0 || indexState.currentPage <= 1;
    nextButton.disabled = totalWorks === 0 || indexState.currentPage >= totalPages;
    pagination.classList.toggle("is-single-page", totalPages <= 1);
  }

  function configureOpeningVisual() {
    const visual = document.querySelector("[data-opening-visual]");
    const image = document.querySelector("[data-opening-image]");
    const setting = data.openingVisual;
    if (!visual || !image || !setting || !setting.src) {
      return;
    }

    image.src = setting.src;
    if (setting.srcset) {
      image.srcset = setting.srcset;
      image.sizes = "(max-width: 820px) 90vw, 58vw";
    }
    if (setting.width && setting.height) {
      image.width = setting.width;
      image.height = setting.height;
    }
    image.alt = setting.alt || "作家の宣材または代表作品";
    image.addEventListener("load", () => visual.classList.add("has-image"), { once: true });
    image.addEventListener("error", () => {
      image.removeAttribute("src");
      visual.classList.remove("has-image");
    }, { once: true });
  }

  function configureEnThread() {
    const canvas = document.querySelector("[data-en-thread]");
    if (!canvas) {
      return null;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    const reducedMotion = prefersReducedMotion();
    // openingの線は待ち時間を感じさせず、約1.2秒で最初の結びまで進める。
    const introductionDuration = 1200;
    let introductionProgress = reducedMotion ? 1 : 0;
    let layout = null;
    let drawFrameId = 0;
    let introductionStartedAt = 0;
    let canvasPixelRatio = 1;

    function rebuild() {
      window.cancelAnimationFrame(drawFrameId);
      drawFrameId = window.requestAnimationFrame(() => {
        const pageHeight = Math.ceil(document.documentElement.scrollHeight);
        canvasPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.ceil(window.innerWidth * canvasPixelRatio);
        canvas.height = Math.ceil(window.innerHeight * canvasPixelRatio);
        canvas.style.height = `${window.innerHeight}px`;
        context.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
        layout = createEnThreadPath(pageHeight);
        draw();
      });
    }

    function createEnThreadPath(pageHeight) {
      const opening = document.querySelector(".opening");
      const knotTarget = document.querySelector("[data-en-knot-target]");
      const width = window.innerWidth;
      const routePath = new Path2D();
      const openingRect = opening.getBoundingClientRect();
      const openingTop = openingRect.top + window.scrollY;
      const openingBottom = openingRect.bottom + window.scrollY;
      const start = { x: width * 0.94, y: openingTop + Math.min(120, openingRect.height * 0.16) };
      const firstTie = { x: width * 0.18, y: openingBottom - Math.min(90, openingRect.height * 0.12) };
      const knotRect = knotTarget ? knotTarget.getBoundingClientRect() : null;
      const knotCenter = {
        x: knotRect ? knotRect.left + knotRect.width * 0.5 : width * 0.5,
        y: knotRect ? knotRect.top + window.scrollY + knotRect.height * 0.45 : pageHeight - 240
      };
      const ties = [start, firstTie];
      let routeLength = 0;
      let openingLength = 0;
      const routeCheckpoints = [{ y: start.y, distance: 0 }];

      /*
       * 同じ表示行の作品は一つの波として扱う。カードごとに点を置くと、一覧表示で
       * 同じ高さの二点を横に結んだ後、ベジェ制御点が上へ戻る経路になるためである。
       */
      const minimumRowGap = Math.max(
        96,
        Math.min(220, window.innerHeight * 0.16)
      );
      const workRowYs = [];
      document.querySelectorAll(".work-card").forEach(card => {
        const rect = card.getBoundingClientRect();
        const centerY = rect.top + window.scrollY + rect.height * 0.54;
        const previousY = workRowYs.at(-1);
        if (centerY <= firstTie.y + minimumRowGap * 0.5
            || centerY >= knotCenter.y - minimumRowGap * 0.5
            || (previousY != null && centerY - previousY < minimumRowGap)) {
          return;
        }
        workRowYs.push(centerY);
      });
      workRowYs.forEach((y, index) => ties.push({
        x: width * (index % 2 === 0 ? 0.86 : 0.14),
        y
      }));
      ties.push(knotCenter);

      routePath.moveTo(ties[0].x, ties[0].y);
      for (let index = 1; index < ties.length; index += 1) {
        const previous = ties[index - 1];
        const current = ties[index];
        // 各点と制御点のY座標を必ず増加させ、上方向へ逆行しない波線にする。
        const verticalDistance = current.y - previous.y;
        if (verticalDistance <= 0) {
          continue;
        }
        const control1 = {
          x: previous.x,
          y: previous.y + verticalDistance * 0.46
        };
        const control2 = {
          x: current.x,
          y: current.y - verticalDistance * 0.46
        };
        routePath.bezierCurveTo(
          control1.x,
          control1.y,
          control2.x,
          control2.y,
          current.x,
          current.y
        );
        routeLength += estimateBezierLength(
          previous,
          control1,
          control2,
          current,
          routeLength,
          routeCheckpoints
        );
        if (index === 1) {
          openingLength = routeLength;
        }
      }

      const knotPath = new Path2D();
      knotPath.moveTo(knotCenter.x, knotCenter.y);
      const knotLength = appendBowKnot(knotPath, knotCenter.x, knotCenter.y, width);

      return {
        routePath,
        routeLength,
        knotPath,
        knotLength,
        openingLength,
        openingEndY: firstTie.y,
        openingBottomY: openingBottom,
        routeEndY: knotCenter.y,
        routeCheckpoints
      };
    }

    function appendBowKnot(path, centerX, centerY, pageWidth) {
      const knotWidth = Math.min(Math.max(pageWidth * 0.075, 56), 116);
      const knotHeight = knotWidth * 0.58;
      const center = { x: centerX, y: centerY };
      let current = center;
      let length = 0;

      function curveTo(control1, control2, end) {
        path.bezierCurveTo(
          control1.x,
          control1.y,
          control2.x,
          control2.y,
          end.x,
          end.y
        );
        length += estimateBezierLength(current, control1, control2, end);
        current = end;
      }

      // 一本の線が左の輪、右の輪、結び目の先へ順番に進む蝶々結び。
      curveTo(
        { x: centerX - knotWidth * 0.24, y: centerY - knotHeight * 0.36 },
        { x: centerX - knotWidth, y: centerY - knotHeight },
        { x: centerX - knotWidth, y: centerY }
      );
      curveTo(
        { x: centerX - knotWidth, y: centerY + knotHeight },
        { x: centerX - knotWidth * 0.24, y: centerY + knotHeight * 0.38 },
        center
      );
      curveTo(
        { x: centerX + knotWidth * 0.24, y: centerY - knotHeight * 0.38 },
        { x: centerX + knotWidth, y: centerY - knotHeight },
        { x: centerX + knotWidth, y: centerY }
      );
      curveTo(
        { x: centerX + knotWidth, y: centerY + knotHeight },
        { x: centerX + knotWidth * 0.24, y: centerY + knotHeight * 0.36 },
        center
      );
      curveTo(
        { x: centerX - knotWidth * 0.08, y: centerY + knotHeight * 0.45 },
        { x: centerX - knotWidth * 0.2, y: centerY + knotHeight },
        { x: centerX - knotWidth * 0.38, y: centerY + knotHeight * 1.55 }
      );
      path.moveTo(centerX, centerY);
      current = center;
      curveTo(
        { x: centerX + knotWidth * 0.08, y: centerY + knotHeight * 0.45 },
        { x: centerX + knotWidth * 0.2, y: centerY + knotHeight },
        { x: centerX + knotWidth * 0.38, y: centerY + knotHeight * 1.55 }
      );
      return length;
    }

    function estimateBezierLength(
      start,
      control1,
      control2,
      end,
      startDistance = 0,
      checkpoints = null
    ) {
      let length = 0;
      let previous = start;
      const samples = 20;
      for (let index = 1; index <= samples; index += 1) {
        const time = index / samples;
        const inverse = 1 - time;
        const point = {
          x: inverse ** 3 * start.x
            + 3 * inverse ** 2 * time * control1.x
            + 3 * inverse * time ** 2 * control2.x
            + time ** 3 * end.x,
          y: inverse ** 3 * start.y
            + 3 * inverse ** 2 * time * control1.y
            + 3 * inverse * time ** 2 * control2.y
            + time ** 3 * end.y
        };
        length += Math.hypot(point.x - previous.x, point.y - previous.y);
        if (checkpoints) {
          const checkpointY = Math.max(
            checkpoints.at(-1)?.y ?? point.y,
            point.y
          );
          checkpoints.push({
            y: checkpointY,
            distance: startDistance + length
          });
        }
        previous = point;
      }
      return length;
    }

    /**
     * スクロール進行率を曲線長へ変換する。
     * 縦位置を主成分、実線長を補助成分にすることで、同じ高さに作品が並ぶ
     * 真横の経路にも描画区間を割り当てつつ、閲覧位置からの遅れを防ぐ。
     */
    function routeDistanceAtProgress(layout, targetProgress) {
      const checkpoints = layout.routeCheckpoints
        .filter(point => point.distance >= layout.openingLength);
      if (checkpoints.length === 0 || targetProgress <= 0) {
        return layout.openingLength;
      }
      const verticalRange = Math.max(
        1,
        layout.routeEndY - layout.openingEndY
      );
      const distanceRange = Math.max(
        1,
        layout.routeLength - layout.openingLength
      );
      const mapped = checkpoints.map(point => ({
        distance: point.distance,
        progress: 0.78 * clamp(
          (point.y - layout.openingEndY) / verticalRange
        ) + 0.22 * clamp(
          (point.distance - layout.openingLength) / distanceRange
        )
      }));
      for (let index = 1; index < mapped.length; index += 1) {
        const previous = mapped[index - 1];
        const current = mapped[index];
        if (targetProgress <= current.progress) {
          const progressRange = Math.max(
            0.000001,
            current.progress - previous.progress
          );
          const progress = clamp(
            (targetProgress - previous.progress) / progressRange
          );
          return previous.distance
            + (current.distance - previous.distance) * progress;
        }
      }
      return layout.routeLength;
    }

    function draw() {
      if (!layout) {
        return;
      }

      const width = window.innerWidth;
      const height = window.innerHeight;
      const scrollRange = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const routeStartScroll = Math.min(
        scrollRange,
        Math.max(0, layout.openingBottomY - height * 0.72)
      );
      /*
       * 糸の先端がページの縦位置へ追従するよう、蝶々結びの中心が画面下部へ
       * 入る時点までを経路描画区間とする。横方向の振れが大きい区間でも、
       * 単純な線長比によって画面の進行から遅れない。
       */
      const routeEndScroll = Math.min(
        scrollRange,
        Math.max(routeStartScroll + 1, layout.routeEndY - height * 0.88)
      );
      const routeScrollProgress = clamp(
        (window.scrollY - routeStartScroll)
          / Math.max(1, routeEndScroll - routeStartScroll)
      );
      const scrollDrivenRouteDistance = routeDistanceAtProgress(
        layout,
        routeScrollProgress
      );
      const introductionDistance =
        layout.openingLength * introductionProgress;
      const drawnRouteDistance = reducedMotion
        ? layout.routeLength
        : Math.max(introductionDistance, scrollDrivenRouteDistance);
      const routeProgress = clamp(
        Math.min(drawnRouteDistance, layout.routeLength)
          / layout.routeLength
      );
      const knotProgress = reducedMotion
        ? 1
        : clamp(
          (window.scrollY - routeEndScroll)
            / Math.max(1, scrollRange - routeEndScroll)
        );

      // Canvas自体は常に表示領域の寸法に限定し、巨大な縦長Canvasを生成しない。
      context.setTransform(canvasPixelRatio, 0, 0, canvasPixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.setTransform(
        canvasPixelRatio,
        0,
        0,
        canvasPixelRatio,
        0,
        -window.scrollY * canvasPixelRatio
      );
      context.lineCap = "round";
      context.lineJoin = "round";
      context.globalAlpha = 0.48;
      context.strokeStyle = getCssColor("--season-primary");
      context.lineWidth = 1.6;
      strokePathProgress(layout.routePath, layout.routeLength, routeProgress);
      strokePathProgress(layout.knotPath, layout.knotLength, knotProgress);
      context.setLineDash([]);
      context.globalAlpha = 1;
    }

    function strokePathProgress(path, length, progress) {
      if (progress <= 0 || length <= 0) {
        return;
      }
      context.setLineDash([length, length]);
      context.lineDashOffset = length * (1 - progress);
      context.stroke(path);
    }

    function clamp(value) {
      return Math.min(1, Math.max(0, value));
    }

    function animateIntroduction(timestamp) {
      if (reducedMotion || introductionProgress >= 1) {
        draw();
        return;
      }
      if (!introductionStartedAt) {
        introductionStartedAt = timestamp;
      }
      introductionProgress = Math.min(1, (timestamp - introductionStartedAt) / introductionDuration);
      draw();
      window.requestAnimationFrame(animateIntroduction);
    }

    function scheduleDraw() {
      window.cancelAnimationFrame(drawFrameId);
      drawFrameId = window.requestAnimationFrame(draw);
    }

    window.addEventListener("scroll", scheduleDraw, { passive: true });
    window.addEventListener("resize", rebuild, { passive: true });
    window.addEventListener("load", rebuild, { once: true });
    /*
     * Safari等で履歴復元（bfcache）されたCanvasは内容が失われる場合がある。
     * pageshowと再表示時に経路を再構築し、季節変更をしなくても復元する。
     */
    window.addEventListener("pageshow", rebuild);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        rebuild();
      }
    });
    const main = document.querySelector("main");
    if (main && typeof ResizeObserver === "function") {
      new ResizeObserver(rebuild).observe(main);
    }
    rebuild();
    // 非同期JSON・画像・Webフォント反映後の確定寸法でもう一度描き直す。
    window.requestAnimationFrame(() => window.requestAnimationFrame(rebuild));
    document.fonts?.ready.then(rebuild);
    if (!reducedMotion) {
      window.requestAnimationFrame(animateIntroduction);
    }

    return { rebuild };
  }

  function scheduleEnThreadLayout() {
    if (!enThreadController) {
      return;
    }
    // 表示切り替え後の実寸が確定してから、縁の経路を引き直す。
    window.requestAnimationFrame(() => enThreadController.rebuild());
  }

  function getCssColor(propertyName) {
    return getComputedStyle(root).getPropertyValue(propertyName).trim();
  }

  function createWorkCard(work, index) {
    const article = document.createElement("article");
    article.className = "work-card";
    article.style.setProperty("--work-index", index);

    const heading = document.createElement("div");
    heading.className = "work-heading";
    heading.innerHTML = `
      <div>
        <p class="work-number">${String(index + 1).padStart(2, "0")}</p>
        <h3><a href="work.html?id=${encodeURIComponent(work.id)}">${escapeHtml(work.title)}</a></h3>
      </div>
      <div class="work-meta-compact">
        <span>${escapeHtml(work.year)}</span>
        ${work.saleLabel ? `<span class="sale-state">${escapeHtml(work.saleLabel)}</span>` : ""}
      </div>
    `;

    const track = document.createElement("div");
    track.className = "work-track";
    track.setAttribute("aria-label", `${work.title}の画像`);
    work.images.forEach((image, imageIndex) => {
      const link = document.createElement("a");
      link.className = "art-frame";
      link.href = `work.html?id=${encodeURIComponent(work.id)}`;
      link.setAttribute("aria-label", `${work.title}の詳細を開く、画像${imageIndex + 1}`);
      const surface = document.createElement("span");
      surface.className = "art-surface";
      surface.append(createResponsiveImage(
        image,
        "(max-width: 820px) 84vw, min(76vw, 920px)",
        "lazy"
      ));
      link.append(surface);
      track.append(link);
    });

    const trackFooter = document.createElement("div");
    trackFooter.className = "track-footer";

    const navigation = document.createElement("div");
    navigation.className = "track-navigation";
    const previousButton = createTrackButton("前へ", "←", -1, track);
    const nextButton = createTrackButton("次へ", "→", 1, track);
    navigation.append(previousButton, nextButton);

    const position = document.createElement("p");
    position.className = "track-position";
    position.textContent = `1 / ${work.images.length}`;
    track.addEventListener("scroll", () => {
      const frames = Array.from(track.children);
      if (!frames.length) {
        return;
      }
      const nearest = frames.reduce((best, frame, frameIndex) => {
        const distance = Math.abs(frame.offsetLeft - track.scrollLeft);
        return distance < best.distance ? { index: frameIndex, distance } : best;
      }, { index: 0, distance: Number.POSITIVE_INFINITY });
      position.textContent = `${nearest.index + 1} / ${work.images.length}`;
    }, { passive: true });

    trackFooter.append(navigation, position);
    article.append(heading, track, trackFooter);
    return article;
  }

  function createTrackButton(label, symbol, direction, track) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "track-button";
    button.setAttribute("aria-label", label);
    button.textContent = symbol;
    button.addEventListener("click", () => {
      track.scrollBy({
        left: track.clientWidth * 0.84 * direction,
        behavior: prefersReducedMotion() ? "auto" : "smooth"
      });
    });
    return button;
  }

  function buildWorkDetail() {
    const params = new URLSearchParams(window.location.search);
    const work = data.works.find(item => item.id === params.get("id")) || data.works[0];
    if (!work) {
      throw new Error("公開作品がありません。");
    }
    document.title = `${work.title} — ${data.artist.name}`;

    const host = document.querySelector("[data-work-detail]");
    const images = work.images.map((image, index) => `
      <figure class="detail-art">
        <span class="art-surface">${responsiveImageMarkup(
          image,
          "(max-width: 820px) 100vw, min(72vw, 940px)"
        )}</span>
        <figcaption>${String(index + 1).padStart(2, "0")} / ${String(work.images.length).padStart(2, "0")}</figcaption>
      </figure>
    `).join("");

    host.innerHTML = `
      <header class="detail-heading">
        <div>
          ${work.series.length
            ? `<p class="eyebrow">${work.series.map(escapeHtml).join(" / ")}</p>`
            : ""}
          <h1>${escapeHtml(work.title)}</h1>
        </div>
        <div class="detail-year">
          <span>${escapeHtml(work.year)}</span>
          ${work.saleLabel ? `<span class="sale-state">${escapeHtml(work.saleLabel)}</span>` : ""}
        </div>
      </header>
      <div class="detail-gallery">${images}</div>
      <div class="detail-information">
        <dl>
          <div><dt>制作年</dt><dd>${escapeHtml(work.year)}</dd></div>
          ${work.workType ? `<div><dt>作品種別</dt><dd>${escapeHtml(work.workType)}</dd></div>` : ""}
          ${work.medium ? `<div><dt>技法・素材</dt><dd>${escapeHtml(work.medium)}</dd></div>` : ""}
          ${work.dimensions ? `<div><dt>寸法</dt><dd>${escapeHtml(work.dimensions)}</dd></div>` : ""}
          ${work.weight ? `<div><dt>重量</dt><dd>${escapeHtml(work.weight)}</dd></div>` : ""}
          ${work.saleLabel ? `<div><dt>状態</dt><dd>${escapeHtml(work.saleLabel)}</dd></div>` : ""}
        </dl>
        ${work.statement ? `<div class="detail-statement">
          <p class="eyebrow">作品解説</p>
          <p>${multilineHtml(work.statement)}</p>
        </div>` : ""}
      </div>
    `;

    const related = data.works
      .filter(candidate => candidate.id !== work.id)
      .map(candidate => ({
        work: candidate,
        score: candidate.series.filter(tag => work.series.includes(tag)).length
      }))
      .sort((left, right) => right.score - left.score || Number(right.work.year) - Number(left.work.year))
      .slice(0, 3);
    const relatedHost = document.querySelector("[data-related-works]");
    related.forEach(item => relatedHost.append(createRelatedCard(item.work)));
  }

  function createRelatedCard(work) {
    const link = document.createElement("a");
    link.className = "related-card";
    link.href = `work.html?id=${encodeURIComponent(work.id)}`;
    link.innerHTML = `
      <span class="art-surface">${responsiveImageMarkup(
        work.images[0],
        "(max-width: 820px) 100vw, 33vw"
      )}</span>
      <span class="related-title">${escapeHtml(work.title)}</span>
      <span class="related-year">${escapeHtml(work.year)}</span>
    `;
    return link;
  }

  /**
   * JSON内の3サイズをsrcsetへ変換する。
   * URLは必ずsite/を基準に解決済みで、JSON自身のjson/ディレクトリは基準にしない。
   */
  function createResponsiveImage(image, sizes, loading) {
    const element = document.createElement("img");
    element.src = image.src;
    element.srcset = image.srcset;
    element.sizes = sizes;
    element.alt = image.alt;
    element.width = image.width;
    element.height = image.height;
    element.loading = loading;
    element.decoding = "async";
    return element;
  }

  function responsiveImageMarkup(image, sizes) {
    return `<img src="${escapeHtml(image.src)}"
      srcset="${escapeHtml(image.srcset)}"
      sizes="${escapeHtml(sizes)}"
      alt="${escapeHtml(image.alt)}"
      width="${image.width}"
      height="${image.height}"
      loading="lazy"
      decoding="async">`;
  }

  async function loadPortfolio() {
    const jsonUrl = new URL("json/portfolio.json", siteRootUrl);
    // 更新後のJSONを再読込時に確実に取得し、画像は版付きURLのブラウザキャッシュを使う。
    jsonUrl.searchParams.set("updated", String(Date.now()));
    let response;
    try {
      response = await fetch(jsonUrl, {
        cache: "no-store",
        headers: { "Accept": "application/json" }
      });
    } catch (error) {
      const localHint = window.location.protocol === "file:"
        ? " ファイルを直接開かず、site/preview.commandから表示してください。"
        : "";
      throw new Error(`portfolio.jsonを読み込めません。${localHint}`, { cause: error });
    }
    if (!response.ok) {
      throw new Error(`portfolio.jsonを読み込めません（HTTP ${response.status}）。`);
    }
    try {
      return await response.json();
    } catch (error) {
      throw new Error("portfolio.jsonのJSON形式が壊れています。", { cause: error });
    }
  }

  /** 公開JSONを画面用の読み取りモデルへ変換し、必須構造とパスを検査する。 */
  function adaptPortfolio(payload) {
    if (!payload || payload.schemaVersion !== "1.0-draft") {
      throw new Error("対応していないportfolio.jsonです。");
    }
    const site = requireObject(payload.site, "site");
    const artist = requireObject(site.artist, "site.artist");
    const theme = requireObject(site.theme, "site.theme");
    const pagination = requireObject(site.pagination, "site.pagination");
    const tagEntries = requireArray(payload.seriesFilters, "seriesFilters");
    const tagNames = new Map(tagEntries.map(tag => [
      requireText(tag.id, "seriesFilters.id"),
      requireText(tag.label, "seriesFilters.label")
    ]));
    const pageSizeOptions = requireArray(
      pagination.pageSizeOptions,
      "site.pagination.pageSizeOptions"
    ).map(value => Number(value)).filter(value => value === 20 || value === 50);
    if (!pageSizeOptions.length) {
      throw new Error("表示件数の選択肢がありません。");
    }

    const works = requireArray(payload.works, "works").map((work, workIndex) => {
      const sale = requireObject(work.sale, `works[${workIndex}].sale`);
      const seriesIds = requireArray(
        work.seriesTagIds,
        `works[${workIndex}].seriesTagIds`
      );
      const images = requireArray(
        work.media,
        `works[${workIndex}].media`
      ).map((image, imageIndex) => adaptPublicImage(
        image,
        `works[${workIndex}].media[${imageIndex}]`
      ));
      if (!images.length) {
        throw new Error(`作品「${work.title || workIndex}」に公開画像がありません。`);
      }
      return {
        id: requireText(work.publicId, `works[${workIndex}].publicId`),
        title: requireText(work.title, `works[${workIndex}].title`),
        year: requireText(work.completionYear, `works[${workIndex}].completionYear`),
        sale: requireText(sale.status, `works[${workIndex}].sale.status`),
        saleLabel: saleLabel(sale),
        series: seriesIds.map(id => tagNames.get(id)).filter(Boolean),
        workType: optionalText(work.workType),
        medium: optionalText(work.material),
        dimensions: optionalText(work.dimensions),
        weight: optionalText(work.weight),
        statement: optionalText(work.caption),
        images
      };
    });

    return {
      siteTitle: requireText(site.title, "site.title"),
      generatedAt: requireText(payload.generatedAt, "generatedAt"),
      artist: {
        name: requireText(artist.name, "site.artist.name"),
        latinName: optionalText(artist.latinName),
        introduction: optionalText(artist.introduction),
        statement: optionalText(artist.statement),
        links: requireArray(artist.links, "site.artist.links").map((link, index) => ({
          label: requireText(link.label, `site.artist.links[${index}].label`),
          url: requireSafeLink(link.url, `site.artist.links[${index}].url`)
        }))
      },
      openingVisual: adaptPublicImage(
        artist.openingVisual,
        "site.artist.openingVisual"
      ),
      seasons: [
        { id: "spring", label: "春" },
        { id: "summer", label: "夏" },
        { id: "autumn", label: "秋" },
        { id: "winter", label: "冬" }
      ],
      views: [
        { id: "exhibition", label: "展示" },
        { id: "collection", label: "一覧" }
      ],
      defaultSeason: ["spring", "summer", "autumn", "winter"].includes(theme.season)
        ? theme.season
        : "autumn",
      defaultView: ["exhibition", "collection"].includes(theme.defaultView)
        ? theme.defaultView
        : "exhibition",
      defaultPageSize: pageSizeOptions.includes(Number(pagination.defaultPageSize))
        ? Number(pagination.defaultPageSize)
        : pageSizeOptions[0],
      pageSizeOptions,
      seriesFilters: tagEntries.map(tag => tag.label),
      works
    };
  }

  function adaptPublicImage(image, fieldName) {
    const source = requireObject(image, fieldName);
    if (source.mediaType !== "image/jpeg") {
      throw new Error(`${fieldName}はJPEGではありません。`);
    }
    const variants = requireObject(source.variants, `${fieldName}.variants`);
    const thumbnail = adaptVariant(variants.thumbnail, `${fieldName}.variants.thumbnail`);
    const display = adaptVariant(variants.display, `${fieldName}.variants.display`);
    const detail = adaptVariant(variants.detail, `${fieldName}.variants.detail`);
    return {
      alt: requireText(source.alt, `${fieldName}.alt`),
      src: display.src,
      srcset: `${thumbnail.src} ${thumbnail.width}w, ${display.src} ${display.width}w, ${detail.src} ${detail.width}w`,
      width: display.width,
      height: display.height
    };
  }

  function adaptVariant(variant, fieldName) {
    const source = requireObject(variant, fieldName);
    const width = Number(source.width);
    const height = Number(source.height);
    if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
      throw new Error(`${fieldName}の画像寸法が不正です。`);
    }
    return {
      src: resolveMediaUrl(requireText(source.src, `${fieldName}.src`)),
      width,
      height
    };
  }

  /**
   * JSONはsite/json/にあるが、画像URLはサイトルート起点のmedia/として扱う。
   * 絶対URL、親移動、media外への参照を拒否し、公開先を移しても同じ構成を保つ。
   */
  function resolveMediaUrl(relativePath) {
    const portable = relativePath.replaceAll("\\", "/");
    if (!/^media\/[A-Za-z0-9._/-]+\.jpg$/i.test(portable)
        || portable.split("/").includes("..")) {
      throw new Error(`公開画像の相対パスが不正です: ${relativePath}`);
    }
    return new URL(portable, siteRootUrl).href;
  }

  function saleLabel(sale) {
    switch (sale.status) {
      case "for_sale": {
        const amount = Number(sale.price && sale.price.amount);
        if (!Number.isSafeInteger(amount) || amount < 0) {
          throw new Error("販売可能作品の公開価格が不正です。");
        }
        return `販売可能　${new Intl.NumberFormat("ja-JP", {
          style: "currency",
          currency: "JPY",
          maximumFractionDigits: 0
        }).format(amount)}`;
      }
      case "reserved":
        return "予約済み";
      case "sold":
        return "販売済み";
      case "not_for_sale":
        return "";
      default:
        throw new Error(`販売状態が不正です: ${sale.status}`);
    }
  }

  function hydrateCommonContent() {
    document.title = body.dataset.page === "index"
      ? data.siteTitle
      : document.title;
    const description = document.querySelector('meta[name="description"]');
    if (description && data.artist.introduction) {
      // meta descriptionでは改行を表示できないため、検索用の1行へだけ整形する。
      description.content = data.artist.introduction.replace(/\s*\r?\n\s*/g, " ");
    }
    document.querySelectorAll(".artist-name").forEach(node => {
      node.textContent = data.artist.name;
    });
    document.querySelectorAll("[data-footer-name]").forEach(node => {
      node.textContent = data.artist.name;
    });
    document.querySelectorAll("[data-copyright-name]").forEach(node => {
      node.textContent = data.artist.name;
    });
    document.querySelectorAll("[data-site-title]").forEach(node => {
      node.textContent = data.siteTitle;
    });
    document.querySelectorAll("[data-statement-artist]").forEach(node => {
      node.textContent = data.artist.name;
    });
    const statementHost = document.querySelector("[data-statement-columns]");
    if (statementHost) {
      statementHost.replaceChildren();
      // 内容の有無や生成順に左右されないよう、列を明示して固定する。
      [
        [data.artist.introduction, "statement-introduction", "作家紹介"],
        [data.artist.statement, "statement-body", "ステートメント"]
      ]
        .filter(([text]) => Boolean(text))
        .forEach(([text, className, label]) => {
          const paragraph = document.createElement("p");
          paragraph.classList.add(className);
          paragraph.setAttribute("aria-label", label);
          setMultilineText(paragraph, text);
          const columnLabel = document.createElement("span");
          columnLabel.classList.add("statement-column-label");
          columnLabel.textContent = label;
          paragraph.prepend(columnLabel);
          statementHost.append(paragraph);
        });
    }
    rebuildNavigationLinks();
    const updated = new Date(data.generatedAt);
    document.querySelectorAll(".last-updated").forEach(node => {
      node.textContent = Number.isNaN(updated.getTime())
        ? `最終更新：${data.generatedAt}`
        : `最終更新：${new Intl.DateTimeFormat("ja-JP", {
          dateStyle: "medium",
          timeStyle: "short"
        }).format(updated)}`;
    });
  }

  function rebuildNavigationLinks() {
    // 本サイトからの外部導線は、各種案内を集約したXだけに限定する。
    const links = data.artist.links.filter(link => {
      try {
        const host = new URL(link.url).hostname.toLowerCase();
        return link.label.trim().toLowerCase() === "x"
          || host === "x.com"
          || host.endsWith(".x.com")
          || host === "twitter.com"
          || host.endsWith(".twitter.com");
      } catch (_error) {
        return false;
      }
    }).slice(0, 1);
    const header = document.querySelector(".header-links");
    if (header) {
      header.replaceChildren();
      if (body.dataset.page === "work") {
        header.append(createLink("作品一覧", "index.html"));
      }
      header.append(createLink("作家紹介", "index.html#statement"));
      links.forEach(link => header.append(
        createLink(link.label, link.url, true)
      ));
    }
    document.querySelectorAll("[data-footer-external-links]").forEach(host => {
      host.replaceChildren();
      links.forEach(link => host.append(
        createLink(link.label, link.url, true)
      ));
    });
  }

  function createLink(label, href, external = false) {
    const link = document.createElement("a");
    link.textContent = label;
    link.href = href;
    if (external) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    return link;
  }

  /**
   * サイトポリシーは公開JSONへ依存しない固定情報として扱う。
   * 読み込み失敗時にも著作権と禁止事項を確認できるよう、JSON取得前に初期化する。
   */
  function configureSitePolicy() {
    const dialog = document.querySelector("[data-policy-dialog]");
    const openers = document.querySelectorAll("[data-policy-open]");
    const closeButton = document.querySelector("[data-policy-close]");
    if (!dialog || openers.length === 0 || !closeButton) {
      return;
    }
    let opener = null;
    openers.forEach(button => {
      button.addEventListener("click", () => {
        opener = button;
        root.classList.add("policy-open");
        dialog.showModal();
        closeButton.focus();
      });
    });
    closeButton.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", event => {
      if (event.target === dialog) {
        dialog.close();
      }
    });
    dialog.addEventListener("close", () => {
      root.classList.remove("policy-open");
      opener?.focus();
    });
  }

  function requireSafeLink(value, fieldName) {
    const text = requireText(value, fieldName);
    let parsed;
    try {
      parsed = new URL(text);
    } catch (error) {
      throw new Error(`${fieldName}がURLではありません。`, { cause: error });
    }
    if (!["https:", "mailto:"].includes(parsed.protocol)) {
      throw new Error(`${fieldName}にはhttpsまたはmailtoだけを指定できます。`);
    }
    return parsed.href;
  }

  function requireObject(value, fieldName) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${fieldName}がありません。`);
    }
    return value;
  }

  function requireArray(value, fieldName) {
    if (!Array.isArray(value)) {
      throw new Error(`${fieldName}が配列ではありません。`);
    }
    return value;
  }

  function requireText(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`${fieldName}が空です。`);
    }
    return value.trim();
  }

  function optionalText(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function markSiteReady() {
    const status = document.querySelector("[data-site-status]");
    if (status) {
      status.hidden = true;
    }
    body.classList.add("is-ready");
  }

  function showSiteError(error) {
    const status = document.querySelector("[data-site-status]");
    if (!status) {
      return;
    }
    status.classList.add("is-error");
    status.textContent = error instanceof Error
      ? error.message
      : "作品情報を表示できません。";
  }

  function configureHeader() {
    const header = document.querySelector("[data-header]");
    if (!header) {
      return;
    }
    let lastY = window.scrollY;
    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastY;
        if (currentY < 80 || delta < -6) {
          header.classList.remove("is-hidden");
        } else if (delta > 8 && currentY > 140) {
          header.classList.add("is-hidden");
        }
        lastY = currentY;
        ticking = false;
      });
    }, { passive: true });
    header.addEventListener("focusin", () => header.classList.remove("is-hidden"));
  }

  function configureBackToTop() {
    document.querySelectorAll("[data-back-to-top]").forEach(link => {
      link.addEventListener("click", event => {
        event.preventDefault();
        window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
      });
    });
  }

  function updateCurrentYear() {
    document.querySelectorAll("[data-current-year]").forEach(node => {
      node.textContent = String(new Date().getFullYear());
    });
  }

  function safeStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (ignored) {
      return null;
    }
  }

  function safeStorageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (ignored) {
      // ローカル保存を拒否されても表示操作は継続する。
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  /** innerHTML内で使う文章だけ、安全にエスケープして改行を明示する。 */
  function multilineHtml(value) {
    return escapeHtml(value).replace(/\r\n?|\n/g, "<br>");
  }

  /** textContent相当の安全性を保ちながら、入力された改行をbr要素へ変換する。 */
  function setMultilineText(node, value) {
    node.replaceChildren();
    String(value).split(/\r\n?|\n/).forEach((line, index) => {
      if (index > 0) {
        node.append(document.createElement("br"));
      }
      node.append(document.createTextNode(line));
    });
  }
}());
