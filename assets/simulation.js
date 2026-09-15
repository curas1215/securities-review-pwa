(() => {
  'use strict';

  // 随机模拟模块 v1：只增加出题能力，不修改原始题库数据。
  // 后续读取原 HTML 中题库对象后，使用同一算法生成试卷。

  window.SecuritiesReviewSimulation = {
    defaultConfig: {
      count: 30,
      mode: 'practice',
      strategy: 'importance_weight',
      typeRatio: {
        single: 0.45,
        multiple: 0.40,
        judge: 0.15
      }
    },

    buildConfig(overrides = {}) {
      return {
        ...this.defaultConfig,
        ...overrides,
        typeRatio: {
          ...this.defaultConfig.typeRatio,
          ...(overrides.typeRatio || {})
        }
      };
    },

    // 题型配额：多选比例提高，符合证券分析师考试训练需求。
    allocateTypes(total, ratio) {
      const single = Math.round(total * ratio.single);
      const multiple = Math.round(total * ratio.multiple);
      return {
        single,
        multiple,
        judge: Math.max(0, total - single - multiple)
      };
    },

    // 章节权重抽样：重要程度越高，进入模拟卷概率越高。
    chapterWeight(chapter) {
      return Math.max(1, Number(chapter.importance || chapter.weight || 1));
    },

    weightedShuffle(items, weightFn) {
      const pool = [...items];
      const result = [];
      while (pool.length) {
        const total = pool.reduce((sum, x) => sum + weightFn(x), 0);
        let point = Math.random() * total;
        let index = 0;
        for (; index < pool.length; index++) {
          point -= weightFn(pool[index]);
          if (point <= 0) break;
        }
        result.push(pool.splice(index, 1)[0]);
      }
      return result;
    },

    // 生成一套随机卷：章节覆盖 + 重要度权重 + 题型比例。
    generate(questionPool, config = {}) {
      const cfg = this.buildConfig(config);
      const count = Math.min(cfg.count, questionPool.length);
      const typeQuota = this.allocateTypes(count, cfg.typeRatio);

      const groups = {
        single: [],
        multiple: [],
        judge: []
      };

      questionPool.forEach(q => {
        const type = q.type || q.questionType || 'single';
        if (groups[type]) groups[type].push(q);
      });

      const selected = [];
      Object.entries(typeQuota).forEach(([type, quota]) => {
        const pool = this.weightedShuffle(groups[type] || [], q => Number(q.importance || q.priority || 1));
        selected.push(...pool.slice(0, quota));
      });

      // 如果某题型不足，用剩余高重要度题补齐。
      if (selected.length < count) {
        const exists = new Set(selected.map(q => q.id));
        const remain = this.weightedShuffle(
          questionPool.filter(q => !exists.has(q.id)),
          q => Number(q.importance || q.priority || 1)
        );
        selected.push(...remain.slice(0, count - selected.length));
      }

      // 最终整卷打散章节顺序。
      return this.weightedShuffle(selected, q => Number(q.importance || q.priority || 1));
    }
  };
})();
