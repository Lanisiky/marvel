(function() {
    let myChart = null;
    let allNodes = [];
    let allLinks = [];

    const FIXED_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];

    let selects = [];

    window.initRingView = async function() {
        selects = [
            document.getElementById('ringChar1'), document.getElementById('ringChar2'),
            document.getElementById('ringChar3'), document.getElementById('ringChar4'),
            document.getElementById('ringChar5'), document.getElementById('ringChar6')
        ];
        const chartDom = document.getElementById('complex-chart');

        if (myChart != null && myChart != "" && myChart != undefined) {
            myChart.dispose();
        }
        myChart = echarts.init(chartDom);
        myChart.showLoading();

        try {
            const [nRes, lRes] = await Promise.all([
                fetch('/api/all-nodes'),
                fetch('/api/all-rels')
            ]);
            allNodes = await nRes.json();
            allLinks = await lRes.json();

            initSelects();

            renderChart();

        } catch (error) {
            console.error("环形图数据加载失败:", error);
        } finally {
            myChart.hideLoading();
        }
    };


    function initSelects() {
        const charNames = [...new Set(allNodes.map(n => n.name))].sort((a, b) => a.localeCompare(b));
        const optionsHtml = charNames.map(c => `<option value="${c}">${c}</option>`).join('');

        selects.forEach((sel, index) => {
            sel.innerHTML = optionsHtml;

            if (charNames[index]) sel.value = charNames[index];
            
            sel.onchange = () => {
                if (validateRingChars()) {
                    renderChart();
                }
            };
        });
    }

    function validateRingChars() {
        selects.forEach(s => s.classList.remove('duplicate'));
        const values = selects.map(s => s.value);
        const counts = {};
        let hasError = false;

        values.forEach(v => counts[v] = (counts[v] || 0) + 1);
        
        selects.forEach(s => {
            if (counts[s.value] > 1) {
                s.classList.add('duplicate');
                hasError = true;
            }
        });
        return !hasError; 
    }

    function prepareData() {
        // 获取当前选中的6个角色
        const selectedChars = selects.map(s => s.value);
        
        // 外圈计算所有角色的关联总数
        const charDegree = {};
        allNodes.forEach(n => charDegree[n.name] = 0);
        allLinks.forEach(l => {
            const sId = l.source.id || l.source;
            const tId = l.target.id || l.target;
            const sNode = allNodes.find(n => n.id === sId);
            const tNode = allNodes.find(n => n.id === tId);
            if (sNode) charDegree[sNode.name]++;
            if (tNode) charDegree[tNode.name]++;
        });

        // 外圈数据
        const outerData = selectedChars.map((name, i) => ({
            name: name,
            value: charDegree[name] || 0,
            itemStyle: { color: FIXED_COLORS[i % FIXED_COLORS.length] }
        }));

        // 内圈数据 
        const defaultChar = outerData[0].name;
        const innerData = calcRelationTypes(defaultChar);

        return { outerData, innerData, defaultChar };
    }

    function calcRelationTypes(charName) {
        const typeCounts = {};
        let total = 0;
        
        allLinks.forEach(l => {
            const sId = l.source.id || l.source;
            const tId = l.target.id || l.target;
            const sNode = allNodes.find(n => n.id === sId);
            const tNode = allNodes.find(n => n.id === tId);

            if (sNode?.name === charName || tNode?.name === charName) {
                const type = l.type || '未知';
                typeCounts[type] = (typeCounts[type] || 0) + 1;
                total++;
            }
        });

        return Object.entries(typeCounts).map(([type, count]) => ({
            name: type,
            value: count,
            ratio: total > 0 ? (count / total * 100).toFixed(1) + '%' : '0%'
        }));
    }

    function renderChart() {
        const { outerData, innerData, defaultChar } = prepareData();

        const option = {
        title: {
            text: '角色关联强度与类型分析',
            left: '72%',       
            top: '30%',        
            textAlign: 'left'  
        },

        tooltip: {
            trigger: 'item',
            formatter: params => {
                if (params.seriesIndex === 0) return `${params.name}<br>总关联: ${params.value}`;
                return `${params.name}<br>数量: ${params.value} (${params.data.ratio})`;
            }
        },

        legend: {
            orient: 'vertical',
            left: '72%',        
            top: '45%',         
            bottom: 'auto',     
            data: outerData.map(d => d.name)
        },

        series: [
            {
                name: '角色关联数',
                type: 'pie',
                radius: ['60%', '80%'],

                center: ['42%', '50%'],  
                
                label: { show: true, position: 'outside' },
                data: outerData
            },
            {
                name: '关系类型',
                type: 'pie',
                radius: ['30%', '50%'],
                
                center: ['42%', '50%'], 
                
                label: { show: true, formatter: '{b}: {c}' },
                data: innerData
            }
        ]
    };

        myChart.setOption(option);

        // 点击外圈切换内圈数据
        myChart.off('click');
        myChart.on('click', params => {
            if (params.seriesIndex === 0) {
                const newInner = calcRelationTypes(params.name);
                myChart.setOption({
                    series: [{}, { data: newInner }]
                });
            }
        });
    }

    // 窗口调整
    window.addEventListener('resize', () => {
        if (myChart) myChart.resize();
    });

})();