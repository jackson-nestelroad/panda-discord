module.exports = {
    printWidth: 120,
    tabWidth: 4,
    trailingComma: 'all',
    singleQuote: true,
    arrowParens: 'avoid',
    importOrder: ['^[^.]', '^[./]'],
    importOrderSeparation: true,
    importOrderSortSpecifiers: true,

    plugins: ['@trivago/prettier-plugin-sort-imports'],
};
