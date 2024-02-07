describe('template spec', () => {
  it('passes', () => {
    cy.visit('https://localhost:8001/dev_index.html')
      let jid, pass;

    jid = 'test@example.com';
    pass = '123';

    cy.get('.btn-login-form').click();
      cy.get('.input-field-jid #jid').clear();
    cy.get('.input-field-jid #jid').type(jid);
    cy.get('#password').type('password');
  cy.get('.btn-log-in').click();
      cy.wait(4000);
      let has_invalid = cy.get('#password').should('satisfy', ($el) => {
          let classList = Array.from($el[0].classList);
          return classList.includes('invalid')
      });
      if (has_invalid) {
          cy.get('#password').clear();
          cy.get('#password').type(pass);
          cy.get('.btn-log-in').click();
      }
      cy.wait(12000);
      cy.get('.btn-finish-log-in').click();
      cy.wait(8000);
      cy.get('.chat-item:first').click();
      cy.wait(2000);
      for (let i = 0; i < 20; i++){
          cy.get('.ql-editor').type(`autotest msg number ${i}`);
          cy.get('.send-message').click();
          cy.wait(50);
      }
      cy.get('.account-item').click();
      cy.get('.delete-all-accounts').click();
      cy.get('.dialog-modal .ok-button').click();
    //
  })
});