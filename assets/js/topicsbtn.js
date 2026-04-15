$(document).ready(function() {
  $(document).on("click", "#topics-toggle", function() {
    $(".side-nav").toggleClass("active");
    console.log("CLICK WORKED");
  });
});
