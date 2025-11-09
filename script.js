// --- Main application logic wrapped in an IIFE ---
(function () {
    // --- State Management ---
    const state = {
        reportData: null,
        templateData: null,
        idCounter: 0,
        commentsVisible: false,
        groqApiKey: sessionStorage.getItem('groqApiKey') || '',
    };

    // --- DOM References ---
    let dom = {};

    // --- Configuration ---
    const API_CONFIG = {
        ENDPOINT: "https://api.groq.com/openai/v1/chat/completions",
        MODEL: "openai/gpt-oss-120b", // Updated to the user-specified model
        TEMPLATE_FILE: 'F908-food-audit-report-template _ Micron2_ 31st Oct 2024_edited.json'
    };

    // --- Utility Functions (Defined Early) ---
    function generateId() {
        return `elem-${state.idCounter++}`;
    }

    function findElementById(id, current = state.reportData) {
        if (!current || typeof current !== 'object') return null;
        if (current.id === id) return current;

        for (const key of Object.keys(current)) {
            if (Array.isArray(current[key])) {
                for (const item of current[key]) {
                    const found = findElementById(id, item);
                    if (found) return found;
                }
            } else if (typeof current[key] === 'object' && key !== 'metadata') {
                const found = findElementById(id, current[key]);
                if (found) return found;
            }
        }
        return null;
    }

    function findMaxId(data) {
        let maxId = 0;
        JSON.stringify(data, (key, value) => {
            if (key === 'id' && typeof value === 'string' && value.startsWith('elem-')) {
                const num = parseInt(value.split('-')[1], 10);
                if (num > maxId) maxId = num;
            }
            return value;
        });
        return maxId;
    }

    function findMatchingTemplateItem(userItem) {
        if (!state.templateData || !userItem || !userItem.title) return null;
        const normalize = (title) => title.replace(/^(\d+(\.\d+)*\s*)/, '').trim().toLowerCase();
        const normalizedUserTitle = normalize(userItem.title);
        if (!normalizedUserTitle) return null;

        function search(items) {
            for (const item of items) {
                if (item.title && normalize(item.title) === normalizedUserTitle) {
                    return item;
                }
                const foundInChildren = item.sections ? search(item.sections) : null;
                if (foundInChildren) return foundInChildren;
            }
            return null;
        }
        return search(state.templateData.chapters);
    }

    function addTrackingToData(node) {
        if (!node || typeof node !== 'object') return;

        // Process titles and text content
        if (node.hasOwnProperty('title') && !node.hasOwnProperty('originalTitle')) {
            node.originalTitle = node.title;
            node.status = 'original';
        }
        if (node.hasOwnProperty('text') && !node.hasOwnProperty('originalText')) {
            node.originalText = node.text;
            node.status = 'original';
        }

        // Recurse through children
        for (const key in node) {
            if (Array.isArray(node[key])) {
                node[key].forEach(addTrackingToData);
            } else if (typeof node[key] === 'object' && node[key] !== null) {
                addTrackingToData(node[key]);
            }
        }
    }
    
    // --- Initialization ---
    document.addEventListener('DOMContentLoaded', initializeApp);

    async function loadInitialReport() {
        updateStatus("Chargement du rapport initial...", "info");
        try {
            const response = await fetch(API_CONFIG.TEMPLATE_FILE);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const jsonString = await response.text();
            loadJsonData(jsonString, API_CONFIG.TEMPLATE_FILE);
        } catch (error) {
            console.error("Failed to load initial report:", error);
            updateStatus("Erreur: Rapport initial introuvable.", "error");
            hideLoading();
        }
    }
    
    function loadJsonData(jsonString, fileName) {
        try {
            showLoading(`Chargement de ${fileName}...`);
            const data = JSON.parse(jsonString);
            
            clearReportDisplay(); // Resets state and UI
            
            addTrackingToData(data); // Add tracking fields if they don't exist
            state.reportData = data;
            state.idCounter = findMaxId(data) + 1;
            state.commentsVisible = data.metadata?.commentsVisible || false;
    
            if (dom.welcomeScreen) dom.welcomeScreen.style.display = 'none';
            if (dom.reportOutput) dom.reportOutput.style.display = 'block';
            
            renderReport();
            updateStatus(`Chargement de ${fileName} réussi.`, "success");
        } catch (error) {
            console.error("JSON Parsing Error:", error);
            updateStatus(`Erreur JSON: ${error.message}`, "error");
            clearReportDisplay();
        } finally {
            hideLoading();
        }
    }
    
    async function initializeApp() {
        console.log("Initializing BRCGS Assistant...");
        cacheDomElements();
        addEventListeners();
        
        if (state.groqApiKey) {
            dom.apiKeyInput.value = '••••••••••••••••';
        }
        
        showLoading("Initialisation de l'application...");
        try {
            await loadTemplateModel();
            await loadInitialReport(); // Load the default report
        } catch (error) {
            console.error("Initialization failed:", error);
            updateStatus("Erreur d'initialisation.", "error");
            hideLoading();
        }
    }
    function cacheDomElements() {
        dom = {
            docxInput: document.getElementById('docx-input'),
            jsonInput: document.getElementById('json-input'),
            loadDocxBtn: document.getElementById('load-docx-btn'),
            loadJsonBtn: document.getElementById('load-json-btn'),
            saveJsonBtn: document.getElementById('save-json-btn'),
            toggleCommentsBtn: document.getElementById('toggle-comments-btn'),
            statusElement: document.getElementById('status'),
            loadingIndicator: document.getElementById('loading-indicator'),
            loadingMessage: document.getElementById('loading-message'),
            reportOutput: document.getElementById('report-output'),
            docInfo: document.getElementById('document-info'),
            docStructure: document.getElementById('document-structure'),
            sidebarNav: document.getElementById('sidebar-nav'),
            apiKeyInput: document.getElementById('api-key-input'),
            setApiKeyBtn: document.getElementById('set-api-key-btn'),
            welcomeScreen: document.getElementById('welcome-screen'),
            aiModal: document.getElementById('ai-modal'),
            diffOutput: document.getElementById('diff-output'),
            acceptSuggestionBtn: document.getElementById('accept-suggestion'),
            rejectSuggestionBtn: document.getElementById('reject-suggestion'),
            aiModalClose: document.getElementById('ai-modal-close'),
            templateModal: document.getElementById('template-modal'),
            templateTextContent: document.getElementById('template-text-content'),
            templateModalClose: document.getElementById('template-modal-close'),
            closeTemplateModalBtn: document.getElementById('close-template-modal'),
        };
    }

    function addEventListeners() {
        dom.loadDocxBtn.addEventListener('click', () => dom.docxInput.click());
        dom.loadJsonBtn.addEventListener('click', () => dom.jsonInput.click());
        dom.docxInput.addEventListener('change', handleDocxFileSelect);
        dom.jsonInput.addEventListener('change', handleJsonFileSelect);
        dom.saveJsonBtn.addEventListener('click', handleSaveJson);
        dom.toggleCommentsBtn.addEventListener('click', handleToggleComments);
        dom.setApiKeyBtn.addEventListener('click', handleSetApiKey);
        
        // Modal listeners
        dom.aiModalClose.addEventListener('click', () => dom.aiModal.style.display = 'none');
        dom.templateModalClose.addEventListener('click', () => dom.templateModal.style.display = 'none');
        dom.closeTemplateModalBtn.addEventListener('click', () => dom.templateModal.style.display = 'none');
        window.addEventListener('click', (event) => {
            if (event.target === dom.aiModal) dom.aiModal.style.display = 'none';
            if (event.target === dom.templateModal) dom.templateModal.style.display = 'none';
        });
    }

    // --- Template & Data Loading ---
    async function loadTemplateModel() {
        const response = await fetch(API_CONFIG.TEMPLATE_FILE);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        state.templateData = await response.json();
        console.log("BRCGS Template model loaded successfully.");
    }
    
    // --- UI Update & Rendering ---
    function updateStatus(message, type = 'info') {
        if (!dom.statusElement) return;
        dom.statusElement.textContent = message;
        dom.statusElement.className = 'status';
        if (type) dom.statusElement.classList.add(type);
    }
    
    function showLoading(message) {
        dom.loadingMessage.textContent = message;
        dom.loadingIndicator.style.display = 'flex';
    }

    function hideLoading() {
        dom.loadingIndicator.style.display = 'none';
    }

    function clearReportDisplay() {
        dom.docInfo.innerHTML = '';
        dom.docStructure.innerHTML = '';
        dom.sidebarNav.innerHTML = '';
        state.reportData = null;
        state.idCounter = 0;
        state.commentsVisible = false;
        
        dom.welcomeScreen.style.display = 'block';
        dom.reportOutput.style.display = 'none';

        dom.saveJsonBtn.disabled = true;
        dom.toggleCommentsBtn.disabled = true;
        updateStatus("Prêt.");
    }

    function renderReport() {
        if (!state.reportData) return;
        dom.docStructure.innerHTML = ''; // Clear main content before re-rendering
        
        renderDocInfo();
        renderStructure(state.reportData.chapters, dom.docStructure);
        buildSidebarNav(state.reportData);
        
        dom.saveJsonBtn.disabled = false;
        dom.toggleCommentsBtn.disabled = false;
    }

    function renderDocInfo() {
        const { metadata } = state.reportData;
        const infoContent = dom.docInfo.querySelector('#info-content');
        if (!infoContent) return;
        
        infoContent.innerHTML = `
            <h2>Informations du Document</h2>
            <p><strong>Nom d'origine:</strong> ${metadata?.originalFilename || 'N/A'}</p>
            <p><strong>Source:</strong> ${metadata?.source?.toUpperCase() || 'N/A'}</p>
        `;
    }

    function renderStructure(items, parentElement) {
        if (!Array.isArray(items)) return;
        items.forEach(item => {
            const container = document.createElement('div');
            container.className = 'report-element';
            container.dataset.id = item.id;

            const titleElement = document.createElement(`h${item.level + 1}`);
            titleElement.contentEditable = "true";
            titleElement.dataset.id = item.id;
            titleElement.textContent = item.title || 'Sans titre';
            titleElement.addEventListener('input', handleContentEdit);
            if (item.status) titleElement.classList.add(`status-${item.status}`);
            
            container.appendChild(titleElement);
            container.appendChild(createActions(item.id, true)); // Pass true for title
            
            renderComments(container, item);

            if (item.content) renderContentItems(item.content, container);
            if (item.sections) renderStructure(item.sections, container);
            if (item.subsections) renderStructure(item.subsections, container);

            parentElement.appendChild(container);
        });
    }

    function renderContentItems(items, parentElement) {
        items.forEach(item => {
            const container = document.createElement('div');
            container.className = 'content-container';
            container.dataset.id = item.id;
            
            let element;
            if (item.type === 'paragraph') {
                element = document.createElement('p');
                element.contentEditable = "true";
                element.textContent = item.text || '';
                if (item.status) element.classList.add(`status-${item.status}`);
            } else if (item.type === 'table') {
                element = document.createElement('table');
                item.rows.forEach(rowData => {
                    const tr = element.insertRow();
                    rowData.cells.forEach(cellData => {
                        const td = tr.insertCell();
                        td.contentEditable = "true";
                        td.dataset.id = cellData.id;
                        td.colSpan = cellData.colspan || 1;
                        if (cellData.status) td.classList.add(`status-${cellData.status}`);
                        if(cellData.vMerge === 'restart') {
                           let rowSpan = 1;
                           const rowIndex = item.rows.indexOf(rowData);
                           for (let i = rowIndex + 1; i < item.rows.length; i++) {
                               const row = item.rows[i];
                               const cellInSameColumn = row.cells[rowData.cells.indexOf(cellData)];
                               if (cellInSameColumn && cellInSameColumn.vMerge === 'continue') {
                                   rowSpan++;
                               } else {
                                   break;
                               }
                           }
                           td.rowSpan = rowSpan > 1 ? rowSpan : 1;
                        }
                        if (cellData.vMerge !== 'continue') {
                            td.textContent = cellData.text || '';
                            td.addEventListener('input', handleContentEdit);
                        }
                    });
                });
            }

            if (element) {
                element.dataset.id = item.id;
                element.addEventListener('input', handleContentEdit);
                container.appendChild(element);
                container.appendChild(createActions(item.id));
                renderComments(container, item);
                parentElement.appendChild(container);
            }
        });
    }

    function renderComments(containerElement, itemData) {
        let commentSection = containerElement.querySelector('.comments-section');
        if (state.commentsVisible && itemData.comments && itemData.comments.length > 0) {
            if (!commentSection) {
                commentSection = document.createElement('div');
                commentSection.className = 'comments-section';
                containerElement.appendChild(commentSection);
            }
            commentSection.style.display = 'block';
            commentSection.innerHTML = '';
            itemData.comments.forEach(comment => {
                const commentDiv = document.createElement('div');
                commentDiv.className = 'comment';
                commentDiv.innerHTML = `<div class="comment-header">${comment.author || 'Anonyme'} - ${new Date(comment.timestamp).toLocaleString()}</div><div class="comment-text">${comment.text}</div>`;
                commentSection.appendChild(commentDiv);
            });
        } else if (commentSection) {
            commentSection.style.display = 'none';
        }
    }

    function createActions(elementId, isTitle = false) {
        const actions = document.createElement('div');
        actions.className = 'element-actions';

        const aiBtn = document.createElement('button');
        aiBtn.innerHTML = '🤖';
        aiBtn.title = "Obtenir une suggestion d'amélioration de l'IA";
        aiBtn.addEventListener('click', () => handleAISuggestClick(elementId, isTitle));
        
        const templateBtn = document.createElement('button');
        templateBtn.innerHTML = '💡';
        templateBtn.title = "Voir le texte du modèle BRCGS";
        templateBtn.addEventListener('click', () => handleViewTemplateClick(elementId, isTitle));

        const commentBtn = document.createElement('button');
        commentBtn.innerHTML = '💬';
        commentBtn.title = "Ajouter un commentaire";
        commentBtn.addEventListener('click', () => handleAddCommentClick(elementId));

        actions.appendChild(templateBtn);
        actions.appendChild(aiBtn);
        actions.appendChild(commentBtn);
        return actions;
    }

    function buildSidebarNav(data) {
        dom.sidebarNav.innerHTML = '';
        if (!data.chapters) return;

        data.chapters.forEach(chapter => {
            const match = chapter.title.match(/^(\d+)\./);
            if (match) {
                const chapterNum = parseInt(match[1], 10);
                if (chapterNum >= 1 && chapterNum <= 9) {
                    const li = document.createElement('li');
                    li.textContent = chapter.title;
                    li.dataset.elementId = chapter.id;
                    li.addEventListener('click', () => {
                        dom.sidebarNav.querySelectorAll('li').forEach(el => el.classList.remove('active'));
                        li.classList.add('active');
                        const targetElement = document.querySelector(`.report-element[data-id="${chapter.id}"]`);
                        if (targetElement) {
                            targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            targetElement.style.transition = 'outline 0.1s ease-in-out, background-color 0.5s ease';
                            targetElement.style.backgroundColor = '#EBF8FF';
                            targetElement.style.outline = '2px solid var(--primary-color)';
                            setTimeout(() => { 
                                targetElement.style.outline = '';
                                targetElement.style.backgroundColor = '';
                            }, 2500);
                        }
                    });
                    dom.sidebarNav.appendChild(li);
                }
            }
        });
    }

    // --- File & Event Handlers ---
    function handleDocxFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        showLoading(`Analyse de ${file.name}...`);
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const zip = await JSZip.loadAsync(e.target.result);
                const xmlString = await zip.file('word/document.xml').async('string');
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(xmlString, "application/xml");

                clearReportDisplay();
                state.idCounter = 0; // Reset for new doc
                
                state.reportData = {
                    metadata: { originalFilename: file.name, source: 'docx', processingTimestamp: new Date().toISOString() },
                    chapters: parseDocxBody(xmlDoc)
                };
                
                dom.welcomeScreen.style.display = 'none';
                dom.reportOutput.style.display = 'block';

                renderReport();
                updateStatus(`Analyse de ${file.name} réussie.`, "success");
            } catch (error) {
                console.error("DOCX Parsing Error:", error);
                updateStatus(`Erreur DOCX: ${error.message}`, "error");
                clearReportDisplay();
            } finally {
                hideLoading();
            }
        };
        reader.readAsArrayBuffer(file);
    }

    function handleJsonFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        showLoading(`Chargement de ${file.name}...`);
        const reader = new FileReader();
        reader.onload = (e) => loadJsonData(e.target.result, file.name);
        reader.readAsText(file);
    }
    
    function handleContentEdit(event) {
        const element = event.target;
        const id = element.dataset.id;
        const dataObject = findElementById(id);
        if (dataObject) {
            const newText = element.innerText;
            let originalText = '';
            let isTitle = false;

            if (element.tagName.startsWith('H') && dataObject.hasOwnProperty('title')) {
                originalText = dataObject.originalTitle;
                isTitle = true;
            } else if (dataObject.hasOwnProperty('text')) {
                originalText = dataObject.originalText;
            }

            if (newText !== originalText) {
                dataObject.status = 'modified-user';
            } else {
                dataObject.status = 'original';
            }
            element.className = element.className.replace(/status-\w+/g, '');
            element.classList.add(`status-${dataObject.status}`);

            if (isTitle) {
                dataObject.title = newText;
                const navItem = dom.sidebarNav.querySelector(`li[data-element-id="${id}"]`);
                if (navItem) navItem.textContent = newText;
            } else {
                dataObject.text = newText;
            }
        }
    }
    
    function handleSetApiKey() {
        const key = dom.apiKeyInput.value.trim();
        if (key && key !== '••••••••••••••••') {
            state.groqApiKey = key;
            sessionStorage.setItem('groqApiKey', key);
            dom.apiKeyInput.value = '••••••••••••••••';
            updateStatus("Clé API enregistrée.", "success");
        } else {
            state.groqApiKey = '';
            sessionStorage.removeItem('groqApiKey');
            dom.apiKeyInput.value = "";
            dom.apiKeyInput.placeholder = "Entrez votre clé API Groq";
            updateStatus("Clé API effacée.");
        }
    }

    function handleToggleComments() {
        state.commentsVisible = !state.commentsVisible;
        dom.toggleCommentsBtn.textContent = state.commentsVisible ? 'Masquer Commentaires' : 'Afficher Commentaires';
        renderReport();
    }

    function handleSaveJson() {
        if (!state.reportData) return updateStatus("Rien à sauvegarder.", "warning");
        
        state.reportData.metadata.lastId = state.idCounter;
        state.reportData.metadata.commentsVisible = state.commentsVisible;
        state.reportData.metadata.savedTimestamp = new Date().toISOString();

        const jsonString = JSON.stringify(state.reportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const filename = (state.reportData.metadata.originalFilename || 'report').replace(/\.(docx|json)$/i, '') + '_edited.json';
        
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        updateStatus(`Sauvegardé: ${filename}.`, "success");
    }

    function handleAddCommentClick(elementId) {
        const commentText = prompt(`Ajouter un commentaire pour l'élément (ID: ${elementId}):`);
        if (commentText?.trim()) {
            const item = findElementById(elementId);
            if (item) {
                if (!item.comments) item.comments = [];
                item.comments.push({ id: generateId(), text: commentText.trim(), author: "Utilisateur", timestamp: new Date().toISOString() });
                if (!state.commentsVisible) handleToggleComments();
                else renderReport();
                updateStatus("Commentaire ajouté.", "success");
            }
        }
    }

    // --- DOCX Parsing Logic ---
    function parseDocxBody(xmlDoc) {
        const body = xmlDoc.getElementsByTagName('w:body')[0];
        if (!body) throw new Error("w:body tag not found in DOCX.");

        let chapters = [];
        let currentChapter = { id: generateId(), title: "Contenu Initial", level: 0, content: [] };
        chapters.push(currentChapter);

        const getParagraphText = p => Array.from(p.getElementsByTagName('w:t')).map(t => t.textContent).join('');
        const getParagraphStyle = p => p.querySelector('pPr > pStyle')?.getAttribute('w:val') || '';

        function getHeadingLevel(style) {
            if (style.toLowerCase().includes('heading1')) return 1;
            if (style.toLowerCase().includes('heading2')) return 2;
            if (style.toLowerCase().includes('heading3')) return 3;
            // Add more heading levels as needed
            return 0; // Not a heading or unknown level
        }

        Array.from(body.children).forEach(element => {
            if (element.nodeName === 'w:p') {
                const text = getParagraphText(element).trim();
                const style = getParagraphStyle(element);
                const headingLevel = getHeadingLevel(style);
                const isNumberedHeading = text.match(/^(\d+(\.\d+)*)\s/);

                if ((headingLevel > 0 || isNumberedHeading) && text) {
                    const level = headingLevel > 0 ? headingLevel : (isNumberedHeading ? text.split(' ')[0].split('.').length : 1);
                    
                    const newItem = { 
                        id: generateId(), 
                        title: text, 
                        originalTitle: text, 
                        status: 'original', 
                        level: level, 
                        content: [], 
                        sections: [] 
                    };

                    if (currentChapter.title === "Contenu Initial" && currentChapter.content.length === 0) {
                        chapters[0] = newItem;
                        currentChapter = newItem;
                    } else {
                        // Logic to nest sections based on level
                        let parent = chapters;
                        let lastItem = chapters[chapters.length - 1];

                        while (lastItem && level > lastItem.level) {
                            if (!lastItem.sections) lastItem.sections = [];
                            parent = lastItem.sections;
                            lastItem = lastItem.sections[lastItem.sections.length - 1];
                        }
                        // If current level is less than or equal to last item's level, find the correct parent
                        while (lastItem && level <= lastItem.level) {
                            // Traverse up to find the correct parent
                            let foundParent = false;
                            function findParentOfLevel(items, targetLevel) {
                                for (const item of items) {
                                    if (item.sections) {
                                        const res = findParentOfLevel(item.sections, targetLevel);
                                        if (res) return res;
                                    }
                                    if (item.level === targetLevel - 1) {
                                        return item;
                                    }
                                }
                                return null;
                            }
                            const potentialParent = findParentOfLevel(chapters, level);
                            if (potentialParent) {
                                parent = potentialParent.sections;
                                lastItem = potentialParent;
                                foundParent = true;
                                break;
                            }
                            break; // Should not happen if structure is consistent
                        }
                        
                        parent.push(newItem);
                        currentChapter = newItem;
                    }
                } else if (text) {
                    currentChapter.content.push({ 
                        id: generateId(), 
                        type: 'paragraph', 
                        text, 
                        originalText: text, 
                        status: 'original', 
                        style, 
                        comments: [] 
                    });
                }
            } else if (element.nodeName === 'w:tbl') {
                if (currentChapter) currentChapter.content.push(parseTable(element));
            }
        });
        return chapters.filter(c => c.title !== "Contenu Initial" || c.content.length > 0);
    }

    function parseTable(tblElement) {
        const tableData = { id: generateId(), type: 'table', rows: [], comments: [] };
        Array.from(tblElement.getElementsByTagName('w:tr')).forEach(trElement => {
            const rowData = { id: generateId(), cells: [] };
            Array.from(trElement.getElementsByTagName('w:tc')).forEach(tcElement => {
                const text = Array.from(tcElement.getElementsByTagName('w:t')).map(t => t.textContent).join('');
                const cellData = { 
                    id: generateId(), 
                    text, 
                    originalText: text, 
                    status: 'original', 
                    comments: [] 
                };
                
                const tcPr = tcElement.querySelector('tcPr');
                if (tcPr) {
                    const gridSpan = tcPr.querySelector('gridSpan');
                    if (gridSpan) cellData.colspan = gridSpan.getAttribute('w:val');
                    const vMerge = tcPr.querySelector('vMerge');
                    if (vMerge) cellData.vMerge = vMerge.getAttribute('w:val') || 'continue';
                }
                rowData.cells.push(cellData);
            });
            tableData.rows.push(rowData);
        });
        return tableData;
    }

    function buildSidebarNav(data) {
        dom.sidebarNav.innerHTML = '';
        if (!data.chapters) return;

        function addItemsToNav(items, parentUl, level = 0) {
            items.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item.title;
                li.dataset.elementId = item.id;
                li.style.paddingLeft = `${16 + level * 15}px`; // Indent sub-chapters
                li.addEventListener('click', () => {
                    dom.sidebarNav.querySelectorAll('li').forEach(el => el.classList.remove('active'));
                    li.classList.add('active');
                    const targetElement = document.querySelector(`.report-element[data-id="${item.id}"]`);
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        targetElement.style.transition = 'outline 0.1s ease-in-out, background-color 0.5s ease';
                        targetElement.style.backgroundColor = '#EBF8FF';
                        targetElement.style.outline = '2px solid var(--primary-color)';
                        setTimeout(() => { 
                            targetElement.style.outline = '';
                            targetElement.style.backgroundColor = '';
                        }, 2500);
                    }
                });
                parentUl.appendChild(li);

                if (item.sections && item.sections.length > 0) {
                    const subUl = document.createElement('ul');
                    li.appendChild(subUl);
                    addItemsToNav(item.sections, subUl, level + 1);
                }
            });
        }

        addItemsToNav(data.chapters, dom.sidebarNav);
    }
    
    // --- AI & Template Logic ---
    async function handleAISuggestClick(elementId, isTitle) {
        if (!state.groqApiKey) {
            alert("Veuillez définir votre clé API Groq dans le menu du haut avant d'utiliser l'IA.");
            return;
        }

        const userItem = findElementById(elementId);
        const userText = isTitle ? userItem?.title : userItem?.text;
        if (!userText) return alert("Aucun texte à améliorer.");

        const templateItem = findMatchingTemplateItem(userItem);
        const templateText = templateItem ? (isTitle ? templateItem.title : (templateItem.content?.[0]?.text || templateItem.text)) : null;
        
        showLoading("Génération de la suggestion IA...");
        const suggestion = await fetchAISuggestion(userText, templateText);
        hideLoading();

        if (suggestion) {
            dom.diffOutput.innerHTML = '';
            const diffString = Diff.createPatch("FileName", userText, suggestion, "oldHeader", "newHeader");
            const diff2htmlUi = new Diff2HtmlUI(dom.diffOutput, diffString, { 
                drawFileList: false, 
                matching: 'lines',
                outputFormat: 'side-by-side'
            });
            diff2htmlUi.draw();

            dom.aiModal.style.display = 'flex';
            
            const newAcceptBtn = dom.acceptSuggestionBtn.cloneNode(true);
            dom.acceptSuggestionBtn.parentNode.replaceChild(newAcceptBtn, dom.acceptSuggestionBtn);
            dom.acceptSuggestionBtn = newAcceptBtn;
            
            dom.acceptSuggestionBtn.onclick = () => {
                const targetElement = document.querySelector(`[data-id="${elementId}"]`);
                if (targetElement) {
                    targetElement.innerText = suggestion;
                    const event = new Event('input', { bubbles: true });
                    targetElement.dispatchEvent(event);
                    
                    const dataObject = findElementById(elementId);
                    if (dataObject) {
                        dataObject.status = 'modified-ai';
                        targetElement.className = targetElement.className.replace(/status-\w+/g, '');
                        targetElement.classList.add(`status-${dataObject.status}`);
                    }
                }
                dom.aiModal.style.display = 'none';
                updateStatus("Suggestion appliquée.", "success");
            };
             dom.rejectSuggestionBtn.onclick = () => dom.aiModal.style.display = 'none';

        } else {
            updateStatus("L'IA n'a pas pu générer de suggestion.", "error");
        }
    }
    
    function handleViewTemplateClick(elementId, isTitle) {
        const userItem = findElementById(elementId);
        const templateItem = findMatchingTemplateItem(userItem);
        let templateText = "Aucun texte de modèle correspondant trouvé pour cette section.";
        
        if (templateItem) {
            if (isTitle) {
                templateText = templateItem.title;
            } else if (templateItem.content && templateItem.content.length > 0) {
                const firstPara = templateItem.content.find(c => c.type === 'paragraph');
                templateText = firstPara ? firstPara.text : "Le modèle pour cette section contient des tableaux ou d'autres éléments non textuels.";
            } else {
                templateText = templateItem.text || templateText;
            }
        }

        dom.templateTextContent.textContent = templateText;
        dom.templateModal.style.display = 'flex';
    }

    async function fetchAISuggestion(userText, templateText) {
        let prompt = `You are an expert BRCGS audit report writer. Your task is to improve the user's draft text to meet the high standards of the official BRCGS template.
        
**Official Template Text (Your Goal):**
---
${templateText || "No template available for this section. Focus on clarity, professionalism, and conciseness using standard audit language."}
---

**User's Draft Text (To Improve):**
---
${userText}
---

**Instructions:**
1. Rewrite the user's draft to be more professional, clear, and comprehensive, using the official template's structure and tone as a guide.
2. Integrate the key facts, dates, and specifics from the user's draft into the improved text.
3. Do NOT invent new facts. If the user's draft is missing information prompted by the template (e.g., a specific date or role), use a clear placeholder like [DATE REQUIRED] or [ROLE REQUIRED].
4. Return ONLY the improved text, without any explanations or conversational filler.`;

        try {
            const response = await fetch(API_CONFIG.ENDPOINT, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.groqApiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: API_CONFIG.MODEL,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.2,
                    max_tokens: 4096
                })
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error.message);
            }
            const data = await response.json();
            return data.choices[0]?.message?.content?.trim();
        } catch (error) {
            console.error("AI API Error:", error);
            updateStatus(`AI Error: ${error.message}`, "error");
            return null;
        }
    }

})(); // End of IIFE
